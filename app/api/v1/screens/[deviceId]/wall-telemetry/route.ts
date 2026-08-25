import { NextResponse } from "next/server";
import { z } from "zod";

import { requestHasValidDeviceToken } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ deviceId: string }> };

const telemetrySchema = z.object({
  wallId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1).optional().nullable(),
  occurrenceKey: z.string().trim().min(1).max(180).optional().nullable(),
  manifestVersion: z.string().trim().min(8).max(128).optional().nullable(),
  sceneMode: z.enum(["SPAN", "INDEPENDENT"]).optional().nullable(),
  currentAssetId: z.string().trim().min(1).optional().nullable(),
  currentItemIndex: z.number().int().min(0).max(10000).optional().nullable(),
  driftMs: z.number().int().min(-60000).max(60000).optional().nullable(),
  clockOffsetMs: z.number().int().min(-300000).max(300000).optional().nullable(),
  correctionMode: z.enum(["NONE", "SOFT", "HARD"]).default("NONE"),
  transport: z.enum(["LOCAL_FILE", "BROWSER_CACHE", "NETWORK"]).default("NETWORK"),
  cacheReady: z.boolean().default(false),
  cachedAssets: z.number().int().min(0).max(10000).default(0),
  cacheBytesMb: z.number().int().min(0).max(10000000).default(0),
  storageFreeMb: z.number().int().min(0).max(10000000).optional().nullable(),
  sourceFailovers: z.number().int().min(0).max(1000000).default(0),
  hardResyncs: z.number().int().min(0).max(1000000).default(0),
  playerVersion: z.string().trim().max(80).optional().nullable(),
  lastError: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const parsed = telemetrySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid wall telemetry", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    select: { id: true, deviceTokenHash: true },
  });

  if (!screen) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }

  if (!requestHasValidDeviceToken(request, screen.deviceTokenHash, { allowLegacy: true })) {
    return NextResponse.json({ error: "Invalid device token" }, { status: 401 });
  }

  const body = parsed.data;
  const member = await prisma.displayWallMember.findFirst({
    where: { wallId: body.wallId, screenId: screen.id },
    select: { id: true },
  });

  if (!member) {
    return NextResponse.json(
      { error: "This device is not assigned to the requested display wall." },
      { status: 404 },
    );
  }

  if (body.campaignId && body.occurrenceKey) {
    const schedule = await prisma.scheduleWindow.findFirst({
      where: {
        screenId: screen.id,
        displayWallId: body.wallId,
        campaignId: body.campaignId,
        occurrenceKey: body.occurrenceKey,
      },
      select: { id: true },
    });

    if (!schedule) {
      return NextResponse.json(
        { error: "Telemetry references a wall run that is not assigned to this device." },
        { status: 409 },
      );
    }
  }

  if (body.currentAssetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: body.currentAssetId },
      select: { id: true },
    });
    if (!asset) {
      return NextResponse.json({ error: "Unknown current asset" }, { status: 409 });
    }
  }

  const now = new Date();
  const data = {
    campaignId: body.campaignId ?? null,
    occurrenceKey: body.occurrenceKey ?? null,
    manifestVersion: body.manifestVersion ?? null,
    sceneMode: body.sceneMode ?? null,
    currentAssetId: body.currentAssetId ?? null,
    currentItemIndex: body.currentItemIndex ?? null,
    driftMs: body.driftMs ?? null,
    clockOffsetMs: body.clockOffsetMs ?? null,
    correctionMode: body.correctionMode,
    transport: body.transport,
    cacheReady: body.cacheReady,
    cachedAssets: body.cachedAssets,
    cacheBytesMb: body.cacheBytesMb,
    storageFreeMb: body.storageFreeMb ?? null,
    sourceFailovers: body.sourceFailovers,
    hardResyncs: body.hardResyncs,
    playerVersion: body.playerVersion ?? null,
    lastError: body.lastError ?? null,
    observedAt: now,
  } as const;

  const telemetry = await prisma.$transaction(async (transaction) => {
    await transaction.screen.update({
      where: { id: screen.id },
      data: { lastSeenAt: now },
    });

    return transaction.displayWallTelemetry.upsert({
      where: {
        wallId_screenId: {
          wallId: body.wallId,
          screenId: screen.id,
        },
      },
      update: data,
      create: {
        wallId: body.wallId,
        screenId: screen.id,
        ...data,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    observedAt: telemetry.observedAt.toISOString(),
  });
}
