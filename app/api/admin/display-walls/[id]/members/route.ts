import { NextResponse } from "next/server";

import {
  buildDisplayWallTopology,
  displayWallMembersSchema,
} from "@/lib/display-walls";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

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

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = displayWallMembersSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid display-wall members", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const wall = await prisma.displayWall.findUnique({
    where: { id },
    select: { id: true, rows: true, columns: true },
  });

  if (!wall) {
    return NextResponse.json({ error: "Display wall not found" }, { status: 404 });
  }

  const screenIds = [...new Set(parsed.data.members.map((member) => member.screenId))];
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
      rows: wall.rows,
      columns: wall.columns,
      members: parsed.data.members,
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

  await prisma.$transaction(async (transaction) => {
    // Replacing topology invalidates previously rendered tiles because each tile
    // is a crop of a specific member position in the logical wall canvas.
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

    await transaction.displayWall.update({
      where: { id },
      data: {
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
