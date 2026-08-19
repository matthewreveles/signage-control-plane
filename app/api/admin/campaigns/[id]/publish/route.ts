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

export async function POST(
  _request: Request,
  context: Context,
) {
  const { id: campaignId } =
    await context.params;

  const campaign =
    await prisma.campaign.findUnique({
      where: {
        id: campaignId,
      },

      include: {
        targets: true,
      },
    });

  if (!campaign) {
    return NextResponse.json(
      {
        error: "Campaign not found",
      },
      { status: 404 },
    );
  }

  const directScreenIds =
    campaign.targets
      .filter(
        (target) =>
          target.type === "SCREEN" &&
          target.screenId,
      )
      .map(
        (target) =>
          target.screenId!,
      );

  const groupIds =
    campaign.targets
      .filter(
        (target) =>
          target.type === "GROUP" &&
          target.groupId,
      )
      .map(
        (target) =>
          target.groupId!,
      );

  const groupMembers =
    groupIds.length > 0
      ? await prisma.screenGroupMember.findMany(
          {
            where: {
              groupId: {
                in: groupIds,
              },
            },

            select: {
              screenId: true,
            },
          },
        )
      : [];

  const screenIds = Array.from(
    new Set([
      ...directScreenIds,
      ...groupMembers.map(
        (member) =>
          member.screenId,
      ),
    ]),
  );

  if (!screenIds.length) {
    return NextResponse.json(
      {
        error:
          "No target screens",
      },
      { status: 400 },
    );
  }

  let occurrences:
    ScheduleOccurrence[];

  try {
    if (
      campaign.scheduleType ===
      "RECURRING"
    ) {
      if (
        !campaign.recurrenceStartDate ||
        !campaign.recurrenceEndDate ||
        !campaign.dailyStartTime ||
        !campaign.dailyEndTime
      ) {
        throw new Error(
          "Recurring campaign is missing schedule fields.",
        );
      }

      occurrences =
        buildRecurringOccurrences({
          startDate:
            campaign.recurrenceStartDate,

          endDate:
            campaign.recurrenceEndDate,

          days:
            campaign.recurrenceDays,

          startTime:
            campaign.dailyStartTime,

          endTime:
            campaign.dailyEndTime,

          timeZone:
            campaign.timezone,
        });
    } else {
      occurrences = [
        {
          key: "one-time",
          startAt:
            campaign.startAt,
          endAt:
            campaign.endAt,
        },
      ];
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid campaign schedule",
      },
      { status: 400 },
    );
  }

  const scheduleRows =
    screenIds.flatMap(
      (screenId) =>
        occurrences.map(
          (occurrence) => ({
            campaignId,
            screenId,

            playlistId:
              campaign.playlistId,

            priority:
              campaign.priority,

            occurrenceKey:
              occurrence.key,

            startAt:
              occurrence.startAt,

            endAt:
              occurrence.endAt,
          }),
        ),
    );

  await prisma.$transaction(
    async (transaction) => {
      /*
       * Rebuild this campaign's materialized
       * schedule so changed recurrence rules
       * cannot leave stale occurrences behind.
       */
      await transaction.scheduleWindow.deleteMany(
        {
          where: {
            campaignId,
          },
        },
      );

      await transaction.scheduleWindow.createMany(
        {
          data: scheduleRows,
        },
      );

      await transaction.campaign.update(
        {
          where: {
            id: campaignId,
          },

          data: {
            status: "PUBLISHED",
          },
        },
      );
    },
  );

  return NextResponse.json({
    ok: true,

    scheduleType:
      campaign.scheduleType,

    publishedToScreens:
      screenIds.length,

    occurrences:
      occurrences.length,

    scheduleWindows:
      scheduleRows.length,
  });
}
