import { NextResponse } from "next/server";

import {
  buildRecurringOccurrences,
  type ScheduleOccurrence,
} from "@/lib/campaign-schedule";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Context) {
  const { id: campaignId } = await context.params;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      targets: true,
      playlist: {
        include: {
          items: {
            include: { displayWallCreative: true },
          },
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const directScreenIds = campaign.targets
    .filter((target) => target.type === "SCREEN" && target.screenId)
    .map((target) => target.screenId!);

  const groupIds = campaign.targets
    .filter((target) => target.type === "GROUP" && target.groupId)
    .map((target) => target.groupId!);

  const wallIds = campaign.targets
    .filter((target) => target.type === "WALL" && target.wallId)
    .map((target) => target.wallId!);

  const [groupMembers, wallMembers] = await Promise.all([
    groupIds.length
      ? prisma.screenGroupMember.findMany({
          where: { groupId: { in: groupIds } },
          select: { screenId: true },
        })
      : [],
    wallIds.length
      ? prisma.displayWallMember.findMany({
          where: { wallId: { in: wallIds } },
          select: { screenId: true, wallId: true },
        })
      : [],
  ]);

  const wallByScreen = new Map<string, string>();
  for (const member of wallMembers) {
    const existingWallId = wallByScreen.get(member.screenId);
    if (existingWallId && existingWallId !== member.wallId) {
      return NextResponse.json(
        {
          error:
            "A screen cannot participate in two different display-wall targets within the same campaign.",
        },
        { status: 400 },
      );
    }
    wallByScreen.set(member.screenId, member.wallId);
  }

  const wallCreativeIds = campaign.playlist.items.flatMap((item) =>
    item.kind === "DISPLAY_WALL" && item.displayWallCreative
      ? [item.displayWallCreative.wallId]
      : [],
  );
  const missingWallTargets = [...new Set(wallCreativeIds)].filter(
    (wallId) => !wallIds.includes(wallId),
  );

  if (missingWallTargets.length) {
    return NextResponse.json(
      {
        error:
          "This playlist contains shared wall creative for a wall that is not targeted by the campaign.",
      },
      { status: 400 },
    );
  }

  for (const wallId of wallIds) {
    if (!wallMembers.some((member) => member.wallId === wallId)) {
      return NextResponse.json(
        { error: "One or more targeted display walls have no assigned screens." },
        { status: 400 },
      );
    }
  }

  const screenIds = Array.from(
    new Set([
      ...directScreenIds,
      ...groupMembers.map((member) => member.screenId),
      ...wallMembers.map((member) => member.screenId),
    ]),
  );

  if (!screenIds.length) {
    return NextResponse.json({ error: "No target screens" }, { status: 400 });
  }

  let occurrences: ScheduleOccurrence[];

  try {
    if (campaign.scheduleType === "RECURRING") {
      if (
        !campaign.recurrenceStartDate ||
        !campaign.recurrenceEndDate ||
        !campaign.dailyStartTime ||
        !campaign.dailyEndTime
      ) {
        throw new Error("Recurring campaign is missing schedule fields.");
      }

      occurrences = buildRecurringOccurrences({
        startDate: campaign.recurrenceStartDate,
        endDate: campaign.recurrenceEndDate,
        days: campaign.recurrenceDays,
        startTime: campaign.dailyStartTime,
        endTime: campaign.dailyEndTime,
        timeZone: campaign.timezone,
      });
    } else {
      occurrences = [
        {
          key: "one-time",
          startAt: campaign.startAt,
          endAt: campaign.endAt,
        },
      ];
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid campaign schedule",
      },
      { status: 400 },
    );
  }

  const scheduleRows = screenIds.flatMap((screenId) =>
    occurrences.map((occurrence) => ({
      campaignId,
      screenId,
      displayWallId: wallByScreen.get(screenId) ?? null,
      playlistId: campaign.playlistId,
      priority: campaign.priority,
      occurrenceKey: occurrence.key,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
    })),
  );

  await prisma.$transaction(async (transaction) => {
    // Rebuild this campaign's materialized schedule so changed target or
    // recurrence rules cannot leave stale occurrences behind.
    await transaction.scheduleWindow.deleteMany({
      where: { campaignId },
    });

    await transaction.scheduleWindow.createMany({
      data: scheduleRows,
    });

    await transaction.campaign.update({
      where: { id: campaignId },
      data: { status: "PUBLISHED" },
    });
  });

  return NextResponse.json({
    ok: true,
    scheduleType: campaign.scheduleType,
    publishedToScreens: screenIds.length,
    displayWalls: wallIds.length,
    occurrences: occurrences.length,
    scheduleWindows: scheduleRows.length,
  });
}
