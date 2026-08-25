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

  return Number.isNaN(date.getTime()) ? null : date;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    include: {
      playlist: true,
      targets: true,
    },
  });

  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = stringValue(body.name);

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const timezone = stringValue(body.timezone) || "America/Phoenix";
  const priority =
    typeof body.priority === "number" && Number.isInteger(body.priority)
      ? body.priority
      : 10;

  const scheduleType = body.scheduleType === "RECURRING" ? "RECURRING" : "ONE_TIME";

  let startAt: Date;
  let endAt: Date;
  let recurrenceDays: number[] = [];
  let recurrenceStartDate: string | null = null;
  let recurrenceEndDate: string | null = null;
  let dailyStartTime: string | null = null;
  let dailyEndTime: string | null = null;

  try {
    if (scheduleType === "RECURRING") {
      recurrenceDays = normalizeDays(body.recurrenceDays);
      recurrenceStartDate = stringValue(body.recurrenceStartDate);
      recurrenceEndDate = stringValue(body.recurrenceEndDate);
      dailyStartTime = stringValue(body.dailyStartTime);
      dailyEndTime = stringValue(body.dailyEndTime);

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

      buildRecurringOccurrences({
        startDate: recurrenceStartDate,
        endDate: recurrenceEndDate,
        days: recurrenceDays,
        startTime: dailyStartTime,
        endTime: dailyEndTime,
        timeZone: timezone,
      });

      const envelope = recurringCampaignEnvelope({
        startDate: recurrenceStartDate,
        endDate: recurrenceEndDate,
        timeZone: timezone,
      });

      startAt = envelope.startAt;
      endAt = envelope.endAt;
    } else {
      const parsedStart = parseDate(body.startAt);
      const parsedEnd = parseDate(body.endAt);

      if (!parsedStart || !parsedEnd) {
        return NextResponse.json(
          { error: "startAt/endAt required" },
          { status: 400 },
        );
      }

      if (parsedEnd <= parsedStart) {
        return NextResponse.json(
          { error: "endAt must be after startAt" },
          { status: 400 },
        );
      }

      startAt = parsedStart;
      endAt = parsedEnd;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid schedule",
      },
      { status: 400 },
    );
  }

  const screenIds = stringArray(body.screenIds);
  const groupIds = stringArray(body.groupIds);
  const requestedWallIds = stringArray(body.wallIds);

  const playlistId = typeof body.playlistId === "string" ? body.playlistId : null;
  const assetId = typeof body.assetId === "string" ? body.assetId : null;
  const creativePackageId =
    typeof body.creativePackageId === "string" ? body.creativePackageId : null;
  const displayWallCreativeId =
    typeof body.displayWallCreativeId === "string" ? body.displayWallCreativeId : null;

  if (!playlistId && !assetId && !creativePackageId && !displayWallCreativeId) {
    return NextResponse.json(
      {
        error:
          "Provide playlistId, assetId, creativePackageId or displayWallCreativeId",
      },
      { status: 400 },
    );
  }

  try {
    const resolved = await prisma.$transaction(async (transaction) => {
      if (playlistId) {
        const playlist = await transaction.playlist.findUnique({
          where: { id: playlistId },
        });

        if (!playlist) {
          throw new Error("Unknown playlistId");
        }

        return {
          playlistId,
          impliedWallId: null as string | null,
        };
      }

      const asset = assetId
        ? await transaction.asset.findUnique({ where: { id: assetId } })
        : null;
      if (assetId && !asset) throw new Error("Unknown assetId");

      const creativePackage = creativePackageId
        ? await transaction.creativePackage.findUnique({
            where: { id: creativePackageId },
          })
        : null;
      if (creativePackageId && !creativePackage) {
        throw new Error("Unknown creativePackageId");
      }
      if (creativePackage && creativePackage.status !== "APPROVED") {
        throw new Error("Creative package must be approved before scheduling");
      }

      const displayWallCreative = displayWallCreativeId
        ? await transaction.displayWallCreative.findUnique({
            where: { id: displayWallCreativeId },
          })
        : null;
      if (displayWallCreativeId && !displayWallCreative) {
        throw new Error("Unknown displayWallCreativeId");
      }
      if (displayWallCreative && displayWallCreative.status !== "READY") {
        throw new Error("Display-wall creative must be READY before scheduling");
      }

      const playlist = await transaction.playlist.create({
        data: { name: `Campaign Playlist: ${name}` },
      });

      await transaction.playlistItem.create({
        data: {
          playlistId: playlist.id,
          kind: displayWallCreative
            ? "DISPLAY_WALL"
            : creativePackage
              ? "CREATIVE_PACKAGE"
              : "ASSET",
          assetId: asset?.id ?? null,
          creativePackageId: creativePackage?.id ?? null,
          displayWallCreativeId: displayWallCreative?.id ?? null,
          sortOrder: 0,
          durationSec: displayWallCreative
            ? displayWallCreative.durationSec ?? 10
            : asset?.type === "IMAGE" || creativePackage
              ? 10
              : null,
        },
      });

      return {
        playlistId: playlist.id,
        impliedWallId: displayWallCreative?.wallId ?? null,
      };
    });

    const wallIds = Array.from(
      new Set([
        ...requestedWallIds,
        ...(resolved.impliedWallId ? [resolved.impliedWallId] : []),
      ]),
    );

    const campaign = await prisma.campaign.create({
      data: {
        name,
        timezone,
        priority,
        startAt,
        endAt,
        scheduleType,
        recurrenceDays: scheduleType === "RECURRING" ? recurrenceDays : [],
        recurrenceStartDate:
          scheduleType === "RECURRING" ? recurrenceStartDate : null,
        recurrenceEndDate:
          scheduleType === "RECURRING" ? recurrenceEndDate : null,
        dailyStartTime: scheduleType === "RECURRING" ? dailyStartTime : null,
        dailyEndTime: scheduleType === "RECURRING" ? dailyEndTime : null,
        playlistId: resolved.playlistId,
        targets: {
          create: [
            ...screenIds.map((screenId) => ({
              type: "SCREEN" as const,
              screenId,
            })),
            ...groupIds.map((groupId) => ({
              type: "GROUP" as const,
              groupId,
            })),
            ...wallIds.map((wallId) => ({
              type: "WALL" as const,
              wallId,
            })),
          ],
        },
      },
      include: {
        playlist: true,
        targets: true,
      },
    });

    return NextResponse.json(campaign);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create campaign",
      },
      { status: 400 },
    );
  }
}
