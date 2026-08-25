import { NextResponse } from "next/server";

import {
  buildDisplayWallTopology,
  displayWallSettingsSchema,
} from "@/lib/display-walls";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const patchSchema = displayWallSettingsSchema.partial();

const includeWall = {
  members: {
    orderBy: { slotIndex: "asc" as const },
    include: {
      screen: {
        select: {
          id: true,
          screenNumber: true,
          name: true,
          orientation: true,
          width: true,
          height: true,
          deviceId: true,
          lastSeenAt: true,
        },
      },
    },
  },
  creatives: {
    orderBy: { createdAt: "desc" as const },
    include: {
      _count: { select: { tiles: true, playlistItems: true } },
    },
  },
  _count: {
    select: {
      campaignTargets: true,
      schedules: true,
    },
  },
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const wall = await prisma.displayWall.findUnique({
    where: { id },
    include: includeWall,
  });

  if (!wall) {
    return NextResponse.json({ error: "Display wall not found" }, { status: 404 });
  }

  return NextResponse.json(wall);
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid display-wall settings", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.displayWall.findUnique({
    where: { id },
    include: {
      members: { include: { screen: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Display wall not found" }, { status: 404 });
  }

  const nextRows = parsed.data.rows ?? existing.rows;
  const nextColumns = parsed.data.columns ?? existing.columns;
  const nextSyncToleranceMs =
    parsed.data.syncToleranceMs ?? existing.syncToleranceMs;
  const nextHardResyncMs = parsed.data.hardResyncMs ?? existing.hardResyncMs;

  if (nextHardResyncMs <= nextSyncToleranceMs) {
    return NextResponse.json(
      { error: "hardResyncMs must be greater than syncToleranceMs." },
      { status: 400 },
    );
  }

  const geometryChanged =
    nextRows !== existing.rows || nextColumns !== existing.columns;

  let topology = {
    canvasWidth: existing.canvasWidth,
    canvasHeight: existing.canvasHeight,
    members: existing.members.map((member) => ({
      screenId: member.screenId,
      slotIndex: member.slotIndex,
      row: member.row,
      column: member.column,
      x: member.x,
      y: member.y,
      width: member.width,
      height: member.height,
    })),
  };

  if (geometryChanged && existing.members.length) {
    try {
      topology = buildDisplayWallTopology({
        rows: nextRows,
        columns: nextColumns,
        members: existing.members.map((member) => ({
          screenId: member.screenId,
          row: member.row,
          column: member.column,
        })),
        screens: existing.members.map((member) => ({
          id: member.screen.id,
          width: member.screen.width,
          height: member.screen.height,
          orientation: member.screen.orientation,
        })),
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The existing screen positions do not fit the new wall geometry.",
        },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (transaction) => {
    if (geometryChanged) {
      await transaction.displayWallMember.deleteMany({ where: { wallId: id } });
      if (topology.members.length) {
        await transaction.displayWallMember.createMany({
          data: topology.members.map((member) => ({ wallId: id, ...member })),
        });
      }
      await transaction.displayWallCreative.updateMany({
        where: { wallId: id },
        data: { status: "PROCESSING" },
      });
    }

    await transaction.displayWall.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description:
          parsed.data.description === undefined
            ? undefined
            : parsed.data.description ?? null,
        rows: nextRows,
        columns: nextColumns,
        timezone: parsed.data.timezone,
        syncToleranceMs: nextSyncToleranceMs,
        hardResyncMs: nextHardResyncMs,
        preloadLeadSec: parsed.data.preloadLeadSec,
        startGuardMs: parsed.data.startGuardMs,
        requireAllMembersReady: parsed.data.requireAllMembersReady,
        failurePolicy: parsed.data.failurePolicy,
        canvasWidth: topology.canvasWidth,
        canvasHeight: topology.canvasHeight,
      },
    });
  });

  const updated = await prisma.displayWall.findUnique({
    where: { id },
    include: includeWall,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;

  const existing = await prisma.displayWall.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Display wall not found" }, { status: 404 });
  }

  await prisma.displayWall.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
