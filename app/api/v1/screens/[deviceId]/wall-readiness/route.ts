import { NextResponse } from "next/server";
import { z } from "zod";

import { requestHasValidDeviceToken } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";
import { wallManifestVersion, wallReleaseAt } from "@/lib/wall-resilience";

export const runtime = "nodejs";

type Context = { params: Promise<{ deviceId: string }> };

const readinessSchema = z.object({
  wallId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  occurrenceKey: z.string().trim().min(1),
  manifestVersion: z.string().trim().min(8).max(128),
  status: z.enum(["PRELOADING", "READY", "FAILED"]),
  error: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const parsed = readinessSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid wall readiness acknowledgement", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    select: {
      id: true,
      deviceTokenHash: true,
    },
  });

  if (!screen) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }

  if (!requestHasValidDeviceToken(request, screen.deviceTokenHash, { allowLegacy: true })) {
    return NextResponse.json({ error: "Invalid device token" }, { status: 401 });
  }

  const body = parsed.data;

  const schedule = await prisma.scheduleWindow.findFirst({
    where: {
      screenId: screen.id,
      displayWallId: body.wallId,
      campaignId: body.campaignId,
      occurrenceKey: body.occurrenceKey,
    },
    include: {
      displayWall: {
        include: { members: true },
      },
      campaign: true,
      playlist: true,
    },
  });

  if (!schedule?.displayWall || !schedule.campaign) {
    return NextResponse.json(
      { error: "This device is not assigned to the requested wall run." },
      { status: 404 },
    );
  }

  const version = wallManifestVersion({
    wallId: schedule.displayWall.id,
    wallUpdatedAt: schedule.displayWall.updatedAt,
    campaignId: schedule.campaign.id,
    campaignUpdatedAt: schedule.campaign.updatedAt,
    playlistId: schedule.playlist.id,
    playlistUpdatedAt: schedule.playlist.updatedAt,
    occurrenceKey: schedule.occurrenceKey,
  });

  if (body.manifestVersion !== version) {
    return NextResponse.json(
      {
        error: "Wall manifest changed. Refresh the preload plan before acknowledging readiness.",
        expectedManifestVersion: version,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const wall = schedule.displayWall;

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.displayWallReadinessAck.upsert({
      where: {
        wallId_campaignId_occurrenceKey_screenId: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
          screenId: screen.id,
        },
      },
      update: {
        manifestVersion: version,
        status: body.status,
        error: body.status === "FAILED" ? body.error ?? "Preload failed" : null,
        cachedAt: body.status === "READY" ? now : null,
        observedAt: now,
      },
      create: {
        wallId: wall.id,
        campaignId: schedule.campaign!.id,
        occurrenceKey: schedule.occurrenceKey,
        screenId: screen.id,
        manifestVersion: version,
        status: body.status,
        error: body.status === "FAILED" ? body.error ?? "Preload failed" : null,
        cachedAt: body.status === "READY" ? now : null,
        observedAt: now,
      },
    });

    const [readyCount, failedCount] = await Promise.all([
      transaction.displayWallReadinessAck.count({
        where: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
          manifestVersion: version,
          status: "READY",
        },
      }),
      transaction.displayWallReadinessAck.count({
        where: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
          manifestVersion: version,
          status: "FAILED",
        },
      }),
    ]);

    const memberCount = wall.members.length;
    const allReady = readyCount === memberCount && memberCount > 0;

    const existingRun = await transaction.displayWallRun.findUnique({
      where: {
        wallId_campaignId_occurrenceKey: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
        },
      },
    });

    if (allReady && existingRun?.status !== "RUNNING") {
      const releaseAt =
        existingRun?.releaseAt ??
        wallReleaseAt({
          now,
          scheduledStartAt: schedule.startAt,
          startGuardMs: wall.startGuardMs,
        });

      const run = await transaction.displayWallRun.upsert({
        where: {
          wallId_campaignId_occurrenceKey: {
            wallId: wall.id,
            campaignId: schedule.campaign!.id,
            occurrenceKey: schedule.occurrenceKey,
          },
        },
        update: {
          manifestVersion: version,
          status: "ARMED",
          releaseAt,
          blockedReason: null,
        },
        create: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
          manifestVersion: version,
          status: "ARMED",
          releaseAt,
        },
      });

      return { readyCount, failedCount, memberCount, run };
    }

    if (failedCount > 0 && wall.requireAllMembersReady && existingRun?.status !== "RUNNING") {
      const run = await transaction.displayWallRun.upsert({
        where: {
          wallId_campaignId_occurrenceKey: {
            wallId: wall.id,
            campaignId: schedule.campaign!.id,
            occurrenceKey: schedule.occurrenceKey,
          },
        },
        update: {
          manifestVersion: version,
          status: "BLOCKED",
          releaseAt: null,
          blockedReason: `${failedCount} wall member(s) failed preload.`,
        },
        create: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
          manifestVersion: version,
          status: "BLOCKED",
          blockedReason: `${failedCount} wall member(s) failed preload.`,
        },
      });

      return { readyCount, failedCount, memberCount, run };
    }

    const run =
      existingRun ??
      (await transaction.displayWallRun.create({
        data: {
          wallId: wall.id,
          campaignId: schedule.campaign!.id,
          occurrenceKey: schedule.occurrenceKey,
          manifestVersion: version,
          status: "PREPARING",
        },
      }));

    return { readyCount, failedCount, memberCount, run };
  });

  return NextResponse.json({
    ok: true,
    manifestVersion: version,
    readyCount: result.readyCount,
    failedCount: result.failedCount,
    memberCount: result.memberCount,
    allReady: result.readyCount === result.memberCount && result.memberCount > 0,
    run: {
      status: result.run.status,
      releaseAt: result.run.releaseAt?.toISOString() ?? null,
      blockedReason: result.run.blockedReason,
    },
  });
}
