import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const TELEMETRY_FRESH_MS = 15_000;
const DEVICE_ONLINE_MS = 90_000;

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const now = new Date();
  const nowMs = now.getTime();

  const wall = await prisma.displayWall.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: { slotIndex: "asc" },
        include: {
          screen: {
            select: {
              id: true,
              screenNumber: true,
              name: true,
              deviceId: true,
              lastSeenAt: true,
            },
          },
        },
      },
      telemetry: {
        include: {
          currentAsset: { select: { id: true, name: true, type: true } },
        },
      },
      runs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { campaign: { select: { id: true, name: true } } },
      },
    },
  });

  if (!wall) {
    return NextResponse.json({ error: "Display wall not found" }, { status: 404 });
  }

  const run = wall.runs[0] ?? null;
  const readiness = run
    ? await prisma.displayWallReadinessAck.findMany({
        where: {
          wallId: wall.id,
          campaignId: run.campaignId,
          occurrenceKey: run.occurrenceKey,
        },
        select: {
          screenId: true,
          manifestVersion: true,
          status: true,
          error: true,
          cachedAt: true,
          observedAt: true,
        },
      })
    : [];

  const readinessByScreen = new Map(readiness.map((row) => [row.screenId, row]));
  const telemetryByScreen = new Map(wall.telemetry.map((row) => [row.screenId, row]));

  const freshTelemetry = wall.telemetry.filter(
    (row) => nowMs - row.observedAt.getTime() <= TELEMETRY_FRESH_MS,
  );
  const onlineCount = wall.members.filter(
    (member) =>
      member.screen.lastSeenAt &&
      nowMs - member.screen.lastSeenAt.getTime() <= DEVICE_ONLINE_MS,
  ).length;

  const readyCount = run
    ? readiness.filter(
        (row) => row.status === "READY" && row.manifestVersion === run.manifestVersion,
      ).length
    : 0;
  const failedCount = run
    ? readiness.filter(
        (row) => row.status === "FAILED" && row.manifestVersion === run.manifestVersion,
      ).length
    : 0;

  const absoluteDrifts = freshTelemetry
    .map((row) => (row.driftMs === null ? null : Math.abs(row.driftMs)))
    .filter((value): value is number => value !== null);
  const worstDriftMs = absoluteDrifts.length ? Math.max(...absoluteDrifts) : null;

  const sceneModes = new Set(
    freshTelemetry.map((row) => row.sceneMode).filter((mode): mode is "SPAN" | "INDEPENDENT" => Boolean(mode)),
  );
  const sceneMode =
    sceneModes.size === 0
      ? null
      : sceneModes.size === 1
        ? [...sceneModes][0]
        : "MIXED";

  const localFileCount = freshTelemetry.filter((row) => row.transport === "LOCAL_FILE").length;
  const browserCacheCount = freshTelemetry.filter((row) => row.transport === "BROWSER_CACHE").length;
  const networkCount = freshTelemetry.filter((row) => row.transport === "NETWORK").length;
  const cacheReadyCount = freshTelemetry.filter((row) => row.cacheReady).length;
  const sourceFailovers = freshTelemetry.reduce((sum, row) => sum + row.sourceFailovers, 0);
  const hardResyncs = freshTelemetry.reduce((sum, row) => sum + row.hardResyncs, 0);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    freshness: {
      telemetryMs: TELEMETRY_FRESH_MS,
      deviceOnlineMs: DEVICE_ONLINE_MS,
    },
    wall: {
      id: wall.id,
      name: wall.name,
      rows: wall.rows,
      columns: wall.columns,
      canvasWidth: wall.canvasWidth,
      canvasHeight: wall.canvasHeight,
      syncToleranceMs: wall.syncToleranceMs,
      hardResyncMs: wall.hardResyncMs,
      requireAllMembersReady: wall.requireAllMembersReady,
      failurePolicy: wall.failurePolicy,
    },
    run: run
      ? {
          id: run.id,
          campaignId: run.campaignId,
          campaignName: run.campaign.name,
          occurrenceKey: run.occurrenceKey,
          manifestVersion: run.manifestVersion,
          status: run.status,
          releaseAt: run.releaseAt?.toISOString() ?? null,
          blockedReason: run.blockedReason,
          updatedAt: run.updatedAt.toISOString(),
        }
      : null,
    summary: {
      memberCount: wall.members.length,
      onlineCount,
      telemetryFreshCount: freshTelemetry.length,
      readyCount,
      failedCount,
      cacheReadyCount,
      localFileCount,
      browserCacheCount,
      networkCount,
      worstDriftMs,
      sourceFailovers,
      hardResyncs,
      sceneMode,
    },
    members: wall.members.map((member) => {
      const ack = readinessByScreen.get(member.screenId) ?? null;
      const telemetry = telemetryByScreen.get(member.screenId) ?? null;
      const telemetryFresh = Boolean(
        telemetry && nowMs - telemetry.observedAt.getTime() <= TELEMETRY_FRESH_MS,
      );
      const online = Boolean(
        member.screen.lastSeenAt &&
          nowMs - member.screen.lastSeenAt.getTime() <= DEVICE_ONLINE_MS,
      );

      return {
        slotIndex: member.slotIndex,
        row: member.row,
        column: member.column,
        screen: {
          id: member.screen.id,
          screenNumber: member.screen.screenNumber,
          name: member.screen.name,
          deviceId: member.screen.deviceId,
          online,
          lastSeenAt: member.screen.lastSeenAt?.toISOString() ?? null,
        },
        readiness: ack
          ? {
              status: ack.status,
              manifestCurrent: run ? ack.manifestVersion === run.manifestVersion : false,
              error: ack.error,
              cachedAt: ack.cachedAt?.toISOString() ?? null,
              observedAt: ack.observedAt.toISOString(),
            }
          : null,
        telemetry: telemetry
          ? {
              fresh: telemetryFresh,
              sceneMode: telemetry.sceneMode,
              currentItemIndex: telemetry.currentItemIndex,
              currentAsset: telemetry.currentAsset,
              driftMs: telemetry.driftMs,
              clockOffsetMs: telemetry.clockOffsetMs,
              correctionMode: telemetry.correctionMode,
              transport: telemetry.transport,
              cacheReady: telemetry.cacheReady,
              cachedAssets: telemetry.cachedAssets,
              cacheBytesMb: telemetry.cacheBytesMb,
              storageFreeMb: telemetry.storageFreeMb,
              sourceFailovers: telemetry.sourceFailovers,
              hardResyncs: telemetry.hardResyncs,
              playerVersion: telemetry.playerVersion,
              lastError: telemetry.lastError,
              observedAt: telemetry.observedAt.toISOString(),
            }
          : null,
      };
    }),
  });
}
