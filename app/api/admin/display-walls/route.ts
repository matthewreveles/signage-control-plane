import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildDisplayWallTopology,
  displayWallMemberInputSchema,
  displayWallSettingsSchema,
} from "@/lib/display-walls";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createDisplayWallSchema = displayWallSettingsSchema.extend({
  members: z.array(displayWallMemberInputSchema).max(200).default([]),
});

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
  _count: {
    select: {
      creatives: true,
      campaignTargets: true,
      schedules: true,
    },
  },
};

export async function GET() {
  const walls = await prisma.displayWall.findMany({
    orderBy: { createdAt: "desc" },
    include: includeWall,
  });

  return NextResponse.json(walls);
}

export async function POST(request: Request) {
  const parsed = createDisplayWallSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid display wall", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { members, ...settings } = parsed.data;

  if (settings.hardResyncMs <= settings.syncToleranceMs) {
    return NextResponse.json(
      { error: "hardResyncMs must be greater than syncToleranceMs." },
      { status: 400 },
    );
  }

  const screenIds = [...new Set(members.map((member) => member.screenId))];

  const screens = screenIds.length
    ? await prisma.screen.findMany({
        where: { id: { in: screenIds } },
        select: {
          id: true,
          width: true,
          height: true,
          orientation: true,
        },
      })
    : [];

  let topology;
  try {
    topology = buildDisplayWallTopology({
      rows: settings.rows,
      columns: settings.columns,
      members,
      screens,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid display-wall topology",
      },
      { status: 400 },
    );
  }

  const wall = await prisma.displayWall.create({
    data: {
      name: settings.name,
      description: settings.description ?? null,
      rows: settings.rows,
      columns: settings.columns,
      timezone: settings.timezone,
      syncToleranceMs: settings.syncToleranceMs,
      hardResyncMs: settings.hardResyncMs,
      preloadLeadSec: settings.preloadLeadSec,
      startGuardMs: settings.startGuardMs,
      requireAllMembersReady: settings.requireAllMembersReady,
      failurePolicy: settings.failurePolicy,
      canvasWidth: topology.canvasWidth,
      canvasHeight: topology.canvasHeight,
      members: {
        create: topology.members,
      },
    },
    include: includeWall,
  });

  return NextResponse.json(wall, { status: 201 });
}
