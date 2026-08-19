import { NextResponse } from "next/server";

import {
  buildRecurringOccurrences,
  normalizeDays,
  recurringCampaignEnvelope,
} from "@/lib/campaign-schedule";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date = new Date(String(value));

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function GET() {
  const campaigns =
    await prisma.campaign.findMany({
      orderBy: [
        { startAt: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        playlist: true,
        targets: true,
      },
    });

  return NextResponse.json(campaigns);
}

export async function POST(
  request: Request,
) {
  const body = await request
    .json()
    .catch(() => ({}));

  const name = stringValue(body.name);

  if (!name) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 },
    );
  }

  const timezone =
    stringValue(body.timezone) ||
    "America/Phoenix";

  const priority =
    typeof body.priority === "number" &&
    Number.isInteger(body.priority)
      ? body.priority
      : 10;

  const scheduleType =
    body.scheduleType === "RECURRING"
      ? "RECURRING"
      : "ONE_TIME";

  let startAt: Date;
  let endAt: Date;

  let recurrenceDays: number[] = [];
  let recurrenceStartDate: string | null =
    null;
  let recurrenceEndDate: string | null =
    null;
  let dailyStartTime: string | null = null;
  let dailyEndTime: string | null = null;

  try {
    if (scheduleType === "RECURRING") {
      recurrenceDays = normalizeDays(
        body.recurrenceDays,
      );

      recurrenceStartDate = stringValue(
        body.recurrenceStartDate,
      );

      recurrenceEndDate = stringValue(
        body.recurrenceEndDate,
      );

      dailyStartTime = stringValue(
        body.dailyStartTime,
      );

      dailyEndTime = stringValue(
        body.dailyEndTime,
      );

      if (
        !recurrenceStartDate ||
        !recurrenceEndDate ||
        !dailyStartTime ||
        !dailyEndTime
      ) {
        throw new Error(
          "Recurring campaigns require a date range and daily time window.",
        );
      }

      /*
       * Build once during creation so invalid
       * recurrence rules are rejected before
       * anything is written to the database.
       */
      buildRecurringOccurrences({
        startDate: recurrenceStartDate,
        endDate: recurrenceEndDate,
        days: recurrenceDays,
        startTime: dailyStartTime,
        endTime: dailyEndTime,
        timeZone: timezone,
      });

      const envelope =
        recurringCampaignEnvelope({
          startDate:
            recurrenceStartDate,
          endDate:
            recurrenceEndDate,
          timeZone: timezone,
        });

      startAt = envelope.startAt;
      endAt = envelope.endAt;
    } else {
      const parsedStart =
        parseDate(body.startAt);

      const parsedEnd =
        parseDate(body.endAt);

      if (!parsedStart || !parsedEnd) {
        return NextResponse.json(
          {
            error:
              "startAt/endAt required",
          },
          { status: 400 },
        );
      }

      if (parsedEnd <= parsedStart) {
        return NextResponse.json(
          {
            error:
              "endAt must be after startAt",
          },
          { status: 400 },
        );
      }

      startAt = parsedStart;
      endAt = parsedEnd;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid schedule",
      },
      { status: 400 },
    );
  }

  const screenIds: string[] =
    Array.isArray(body.screenIds)
      ? body.screenIds.filter(
          (value: unknown) =>
            typeof value === "string",
        )
      : [];

  const groupIds: string[] =
    Array.isArray(body.groupIds)
      ? body.groupIds.filter(
          (value: unknown) =>
            typeof value === "string",
        )
      : [];

  const playlistId =
    typeof body.playlistId === "string"
      ? body.playlistId
      : null;

  const assetId =
    typeof body.assetId === "string"
      ? body.assetId
      : null;

  const creativePackageId =
    typeof body.creativePackageId ===
    "string"
      ? body.creativePackageId
      : null;

  if (
    !playlistId &&
    !assetId &&
    !creativePackageId
  ) {
    return NextResponse.json(
      {
        error:
          "Provide playlistId, assetId or creativePackageId",
      },
      { status: 400 },
    );
  }

  try {
    const resolvedPlaylistId =
      await prisma.$transaction(
        async (transaction) => {
          if (playlistId) {
            const playlist =
              await transaction.playlist.findUnique(
                {
                  where: {
                    id: playlistId,
                  },
                },
              );

            if (!playlist) {
              throw new Error(
                "Unknown playlistId",
              );
            }

            return playlistId;
          }

          const asset = assetId
            ? await transaction.asset.findUnique(
                {
                  where: {
                    id: assetId,
                  },
                },
              )
            : null;

          if (assetId && !asset) {
            throw new Error(
              "Unknown assetId",
            );
          }

          const creativePackage =
            creativePackageId
              ? await transaction.creativePackage.findUnique(
                  {
                    where: {
                      id: creativePackageId,
                    },
                  },
                )
              : null;

          if (
            creativePackageId &&
            !creativePackage
          ) {
            throw new Error(
              "Unknown creativePackageId",
            );
          }

          if (
            creativePackage &&
            creativePackage.status !==
              "APPROVED"
          ) {
            throw new Error(
              "Creative package must be approved before scheduling",
            );
          }

          const playlist =
            await transaction.playlist.create(
              {
                data: {
                  name: `Campaign Playlist: ${name}`,
                },
              },
            );

          await transaction.playlistItem.create(
            {
              data: {
                playlistId:
                  playlist.id,

                kind: creativePackage
                  ? "CREATIVE_PACKAGE"
                  : "ASSET",

                assetId:
                  asset?.id ?? null,

                creativePackageId:
                  creativePackage?.id ??
                  null,

                sortOrder: 0,

                durationSec:
                  asset?.type ===
                    "IMAGE" ||
                  creativePackage
                    ? 10
                    : null,
              },
            },
          );

          return playlist.id;
        },
      );

    const campaign =
      await prisma.campaign.create({
        data: {
          name,
          timezone,
          priority,
          startAt,
          endAt,

          scheduleType,

          recurrenceDays:
            scheduleType ===
            "RECURRING"
              ? recurrenceDays
              : [],

          recurrenceStartDate:
            scheduleType ===
            "RECURRING"
              ? recurrenceStartDate
              : null,

          recurrenceEndDate:
            scheduleType ===
            "RECURRING"
              ? recurrenceEndDate
              : null,

          dailyStartTime:
            scheduleType ===
            "RECURRING"
              ? dailyStartTime
              : null,

          dailyEndTime:
            scheduleType ===
            "RECURRING"
              ? dailyEndTime
              : null,

          playlistId:
            resolvedPlaylistId,

          targets: {
            create: [
              ...screenIds.map(
                (screenId) => ({
                  type:
                    "SCREEN" as const,
                  screenId,
                }),
              ),

              ...groupIds.map(
                (groupId) => ({
                  type:
                    "GROUP" as const,
                  groupId,
                }),
              ),
            ],
          },
        },

        include: {
          playlist: true,
          targets: true,
        },
      });

    return NextResponse.json(
      campaign,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create campaign",
      },
      { status: 400 },
    );
  }
}
