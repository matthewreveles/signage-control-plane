// app/api/v1/screens/[deviceId]/playlist/route.ts
import { NextResponse } from "next/server";

import { selectBestScreenVariant } from "@/lib/creative-packages";
import { requestHasValidDeviceToken } from "@/lib/device-auth";
import { prisma } from "@/lib/prisma";
import {
  wallManifestVersion,
  wallPreloadWindowStart,
} from "@/lib/wall-resilience";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ deviceId: string }> };

type ScheduleLike = {
  startAt: Date;
  endAt: Date;
  priority: number;
};

type PreloadAsset = {
  assetId: string;
  url: string;
  fallbackUrls: string[];
  expectedBytes: number | null;
  type: "IMAGE" | "VIDEO";
  sourceKind: "ASSET" | "CREATIVE_PACKAGE" | "DISPLAY_WALL";
  sceneMode: "SPAN" | "INDEPENDENT" | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function modeToQuery(mode: string | null | undefined) {
  const m = (mode ?? "TICKER").toUpperCase();
  if (m === "LIST") return "list";
  if (m === "GRID") return "grid";
  return "ticker";
}

function syncGap(durationSeconds: number, reason: string) {
  return {
    kind: "SYNC_GAP" as const,
    durationSeconds: Math.max(1, durationSeconds),
    reason,
  };
}

function runKey(wallId: string, campaignId: string, occurrenceKey: string) {
  return `${wallId}:${campaignId}:${occurrenceKey}`;
}

function redundantUrls(
  primaryUrl: string,
  masterUrl: string,
  renditions: Array<{ url: string }>,
) {
  return Array.from(
    new Set([masterUrl, ...renditions.map((rendition) => rendition.url)]),
  ).filter((url) => url !== primaryUrl);
}

export async function GET(req: Request, ctx: Ctx) {
  const { deviceId } = await ctx.params;

  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    include: {
      schedules: {
        include: {
          campaign: true,
          displayWall: {
            include: { members: true },
          },
          playlist: {
            include: {
              items: {
                include: {
                  asset: { include: { renditions: true } },
                  collection: true,
                  creativePackage: {
                    include: {
                      variants: {
                        where: { destination: "SIGNAGE" },
                        include: { asset: true },
                      },
                    },
                  },
                  displayWallCreative: {
                    include: {
                      wall: true,
                      tiles: {
                        include: {
                          member: true,
                          asset: { include: { renditions: true } },
                        },
                      },
                    },
                  },
                },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!screen) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }
  if (!requestHasValidDeviceToken(req, screen.deviceTokenHash, { allowLegacy: true })) {
    return NextResponse.json({ error: "Invalid device token" }, { status: 401 });
  }

  type ScreenSchedule = NonNullable<typeof screen>["schedules"][number];

  const now = new Date();
  const wallSchedules = screen.schedules.filter(
    (schedule) => schedule.displayWall && schedule.campaign,
  );

  const wallRuns = wallSchedules.length
    ? await prisma.displayWallRun.findMany({
        where: {
          OR: wallSchedules.map((schedule) => ({
            wallId: schedule.displayWallId!,
            campaignId: schedule.campaignId!,
            occurrenceKey: schedule.occurrenceKey,
          })),
        },
      })
    : [];

  const runMap = new Map(
    wallRuns.map((run) => [runKey(run.wallId, run.campaignId, run.occurrenceKey), run]),
  );

  function manifestVersionFor(schedule: ScreenSchedule) {
    if (!schedule.displayWall || !schedule.campaign) return null;

    return wallManifestVersion({
      wallId: schedule.displayWall.id,
      wallUpdatedAt: schedule.displayWall.updatedAt,
      campaignId: schedule.campaign.id,
      campaignUpdatedAt: schedule.campaign.updatedAt,
      playlistId: schedule.playlist.id,
      playlistUpdatedAt: schedule.playlist.updatedAt,
      occurrenceKey: schedule.occurrenceKey,
    });
  }

  const activeCandidates = screen.schedules
    .filter((schedule: ScheduleLike) => schedule.startAt <= now && schedule.endAt >= now)
    .sort((a: ScheduleLike, b: ScheduleLike) => b.priority - a.priority);

  let activeSchedule: ScreenSchedule | null = null;
  let activeWallRun: (typeof wallRuns)[number] | null = null;

  for (const candidate of activeCandidates) {
    if (!candidate.displayWall) {
      activeSchedule = candidate;
      break;
    }

    if (!candidate.campaignId || !candidate.campaign) continue;

    const version = manifestVersionFor(candidate);
    const run = runMap.get(
      runKey(candidate.displayWall.id, candidate.campaign.id, candidate.occurrenceKey),
    );

    if (
      version &&
      run &&
      run.manifestVersion === version &&
      (run.status === "ARMED" || run.status === "RUNNING") &&
      run.releaseAt &&
      run.releaseAt <= now
    ) {
      activeSchedule = candidate;
      activeWallRun = run;
      break;
    }
  }

  const pendingWallSchedule =
    wallSchedules
      .filter((schedule) => {
        if (schedule.endAt < now || !schedule.displayWall) return false;
        const preloadStart = wallPreloadWindowStart({
          scheduledStartAt: schedule.startAt,
          preloadLeadSec: schedule.displayWall.preloadLeadSec,
        });
        return preloadStart <= now;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.startAt.getTime() - b.startAt.getTime();
      })[0] ?? null;

  const baseDevice = {
    deviceId: screen.deviceId,
    screenNumber: screen.screenNumber,
    name: screen.name,
    label: `Screen ${pad2(screen.screenNumber)}`,
    orientation: screen.orientation,
    width: screen.width,
    height: screen.height,
    timezone: screen.timezone,
  };

  const preload =
    pendingWallSchedule?.displayWall && pendingWallSchedule.campaign
      ? (() => {
          const schedule = pendingWallSchedule;
          const wall = schedule.displayWall!;
          const version = manifestVersionFor(schedule)!;
          const run = runMap.get(
            runKey(wall.id, schedule.campaign!.id, schedule.occurrenceKey),
          );

          const assets = schedule.playlist.items.flatMap<PreloadAsset>((playlistItem) => {
            if (playlistItem.kind === "DISPLAY_WALL") {
              const creative = playlistItem.displayWallCreative;
              if (!creative || creative.status !== "READY" || creative.wallId !== wall.id) {
                return [];
              }

              const tile = creative.tiles.find(
                (candidate) => candidate.member.screenId === screen.id,
              );
              if (!tile || tile.asset.status !== "READY") return [];

              const rendition = selectBestScreenVariant(tile.asset.renditions, {
                width: screen.width,
                height: screen.height,
              });
              const url = rendition?.url ?? tile.asset.masterUrl;

              return [
                {
                  assetId: tile.asset.id,
                  url,
                  fallbackUrls: redundantUrls(
                    url,
                    tile.asset.masterUrl,
                    tile.asset.renditions,
                  ),
                  expectedBytes: rendition?.filesize ?? null,
                  type: tile.asset.type,
                  sourceKind: "DISPLAY_WALL",
                  sceneMode: creative.mode,
                },
              ];
            }

            if (playlistItem.kind === "CREATIVE_PACKAGE") {
              const creativePackage = playlistItem.creativePackage;
              if (!creativePackage || creativePackage.status !== "APPROVED") return [];

              const selected = selectBestScreenVariant(
                creativePackage.variants.filter(
                  (variant) =>
                    variant.asset.status === "READY" &&
                    variant.asset.orientation === screen.orientation,
                ),
                { width: screen.width, height: screen.height },
              );

              return selected
                ? [
                    {
                      assetId: selected.asset.id,
                      url: selected.asset.masterUrl,
                      fallbackUrls: [],
                      expectedBytes: null,
                      type: selected.asset.type,
                      sourceKind: "CREATIVE_PACKAGE",
                      sceneMode: null,
                    },
                  ]
                : [];
            }

            if (playlistItem.kind === "ASSET") {
              const asset = playlistItem.asset;
              if (!asset || asset.status !== "READY" || asset.orientation !== screen.orientation) {
                return [];
              }

              const rendition = selectBestScreenVariant(asset.renditions, {
                width: screen.width,
                height: screen.height,
              });
              const url = rendition?.url ?? asset.masterUrl;

              return [
                {
                  assetId: asset.id,
                  url,
                  fallbackUrls: redundantUrls(url, asset.masterUrl, asset.renditions),
                  expectedBytes: rendition?.filesize ?? null,
                  type: asset.type,
                  sourceKind: "ASSET",
                  sceneMode: null,
                },
              ];
            }

            return [];
          });

          const timeline = schedule.playlist.items.map((playlistItem) => {
            if (playlistItem.kind === "COLLECTION_WIDGET") {
              return syncGap(
                playlistItem.durationSec ?? 15,
                "Dynamic collection requires live network",
              );
            }

            if (playlistItem.kind === "DISPLAY_WALL") {
              const creative = playlistItem.displayWallCreative;
              const durationSeconds =
                creative?.type === "VIDEO"
                  ? creative.durationSec ?? playlistItem.durationSec ?? 15
                  : playlistItem.durationSec ?? 10;

              if (!creative || creative.status !== "READY" || creative.wallId !== wall.id) {
                return syncGap(durationSeconds, "Wall scene unavailable");
              }

              const tile = creative.tiles.find(
                (candidate) => candidate.member.screenId === screen.id,
              );
              if (!tile || tile.asset.status !== "READY") {
                return syncGap(durationSeconds, "Wall member asset unavailable");
              }

              return {
                kind: "ASSET" as const,
                assetId: tile.asset.id,
                type: tile.asset.type,
                sourceKind: "DISPLAY_WALL" as const,
                sceneMode: creative.mode,
                durationSeconds,
              };
            }

            if (playlistItem.kind === "CREATIVE_PACKAGE") {
              const creativePackage = playlistItem.creativePackage;
              if (!creativePackage || creativePackage.status !== "APPROVED") {
                return syncGap(
                  playlistItem.durationSec ?? 10,
                  "Creative package unavailable",
                );
              }

              const selected = selectBestScreenVariant(
                creativePackage.variants.filter(
                  (variant) =>
                    variant.asset.status === "READY" &&
                    variant.asset.orientation === screen.orientation,
                ),
                { width: screen.width, height: screen.height },
              );
              if (!selected) {
                return syncGap(
                  playlistItem.durationSec ?? 10,
                  "No compatible package variant",
                );
              }

              return {
                kind: "ASSET" as const,
                assetId: selected.asset.id,
                type: selected.asset.type,
                sourceKind: "CREATIVE_PACKAGE" as const,
                sceneMode: null,
                durationSeconds:
                  selected.asset.type === "VIDEO"
                    ? selected.asset.durationSec ?? 15
                    : playlistItem.durationSec ?? 10,
              };
            }

            const asset = playlistItem.asset;
            if (!asset || asset.status !== "READY" || asset.orientation !== screen.orientation) {
              return syncGap(playlistItem.durationSec ?? 10, "Asset unavailable");
            }

            return {
              kind: "ASSET" as const,
              assetId: asset.id,
              type: asset.type,
              sourceKind: "ASSET" as const,
              sceneMode: null,
              durationSeconds:
                asset.type === "VIDEO"
                  ? asset.durationSec ?? 15
                  : playlistItem.durationSec ?? 10,
            };
          });

          return {
            wallId: wall.id,
            wallName: wall.name,
            campaignId: schedule.campaign!.id,
            occurrenceKey: schedule.occurrenceKey,
            manifestVersion: version,
            scheduledStartAt: schedule.startAt.toISOString(),
            scheduledStartEpochMs: schedule.startAt.getTime(),
            scheduledEndAt: schedule.endAt.toISOString(),
            scheduledEndEpochMs: schedule.endAt.getTime(),
            releaseAt: run?.releaseAt?.toISOString() ?? null,
            releaseEpochMs: run?.releaseAt?.getTime() ?? null,
            runStatus: run?.status ?? "PREPARING",
            failurePolicy: wall.failurePolicy,
            requireAllMembersReady: wall.requireAllMembersReady,
            assets,
            timeline,
          };
        })()
      : null;

  if (!activeSchedule) {
    return NextResponse.json({
      device: baseDevice,
      items: [],
      sync: null,
      preload,
      generatedAt: now.toISOString(),
      pollSeconds: preload ? 1 : 60,
    });
  }

  const wall = activeSchedule.displayWall;
  const wallMember = wall?.members.find((member) => member.screenId === screen.id) ?? null;
  const activeManifestVersion = wall ? manifestVersionFor(activeSchedule) : null;
  const sync = wall
    ? {
        mode: "DISPLAY_WALL" as const,
        wallId: wall.id,
        wallName: wall.name,
        epochMs: activeWallRun?.releaseAt?.getTime() ?? activeSchedule.startAt.getTime(),
        serverNowMs: now.getTime(),
        toleranceMs: wall.syncToleranceMs,
        hardResyncMs: wall.hardResyncMs,
        failurePolicy: wall.failurePolicy,
        manifestVersion: activeManifestVersion,
        canvasWidth: wall.canvasWidth,
        canvasHeight: wall.canvasHeight,
        member: wallMember
          ? {
              slotIndex: wallMember.slotIndex,
              row: wallMember.row,
              column: wallMember.column,
              x: wallMember.x,
              y: wallMember.y,
              width: wallMember.width,
              height: wallMember.height,
            }
          : null,
      }
    : null;

  const items = activeSchedule.playlist.items
    .map((playlistItem) => {
      if (playlistItem.kind === "COLLECTION_WIDGET") {
        if (!playlistItem.collectionId) {
          return sync
            ? syncGap(playlistItem.durationSec ?? 15, "Collection unavailable")
            : null;
        }

        const renderMode = playlistItem.renderMode ?? "TICKER";
        const mode = modeToQuery(renderMode);

        return {
          kind: "COLLECTION_WIDGET" as const,
          collectionId: playlistItem.collectionId,
          renderMode,
          feedUrl: `/api/v1/collections/${playlistItem.collectionId}/feed?mode=${mode}`,
          durationSeconds: playlistItem.durationSec ?? 15,
        };
      }

      if (playlistItem.kind === "DISPLAY_WALL") {
        const creative = playlistItem.displayWallCreative;
        const durationSeconds =
          creative?.type === "VIDEO"
            ? creative.durationSec ?? playlistItem.durationSec ?? 15
            : playlistItem.durationSec ?? 10;

        if (!sync || !creative || creative.status !== "READY") {
          return sync ? syncGap(durationSeconds, "Wall scene unavailable") : null;
        }
        if (creative.wallId !== sync.wallId) {
          return syncGap(durationSeconds, "Wall scene targets a different cluster");
        }

        const tile = creative.tiles.find(
          (candidate) => candidate.member.screenId === screen.id,
        );
        if (!tile || tile.asset.status !== "READY") {
          return syncGap(durationSeconds, "Wall member asset unavailable");
        }

        const selectedRendition = selectBestScreenVariant(tile.asset.renditions, {
          width: screen.width,
          height: screen.height,
        });
        const url = selectedRendition?.url ?? tile.asset.masterUrl;

        return {
          kind: "ASSET" as const,
          sourceKind: "DISPLAY_WALL" as const,
          sceneMode: creative.mode,
          wallId: creative.wallId,
          wallCreativeId: creative.id,
          wallCreativeName: creative.name,
          slotIndex: tile.member.slotIndex,
          assetId: tile.asset.id,
          type: tile.asset.type,
          url,
          fallbackUrls: redundantUrls(url, tile.asset.masterUrl, tile.asset.renditions),
          width: selectedRendition?.width ?? tile.member.width,
          height: selectedRendition?.height ?? tile.member.height,
          durationSeconds,
        };
      }

      if (playlistItem.kind === "CREATIVE_PACKAGE") {
        const creativePackage = playlistItem.creativePackage;
        if (!creativePackage || creativePackage.status !== "APPROVED") {
          return sync
            ? syncGap(playlistItem.durationSec ?? 10, "Creative package unavailable")
            : null;
        }

        const selected = selectBestScreenVariant(
          creativePackage.variants.filter(
            (variant) =>
              variant.asset.status === "READY" &&
              variant.asset.orientation === screen.orientation,
          ),
          { width: screen.width, height: screen.height },
        );
        if (!selected) {
          return sync
            ? syncGap(playlistItem.durationSec ?? 10, "No compatible package variant")
            : null;
        }

        return {
          kind: "ASSET" as const,
          sourceKind: "CREATIVE_PACKAGE" as const,
          assetId: selected.asset.id,
          type: selected.asset.type,
          url: selected.asset.masterUrl,
          fallbackUrls: [],
          width: selected.width,
          height: selected.height,
          durationSeconds:
            selected.asset.type === "VIDEO"
              ? selected.asset.durationSec ?? 15
              : playlistItem.durationSec ?? 10,
        };
      }

      const asset = playlistItem.asset;
      if (!asset || asset.status !== "READY" || asset.orientation !== screen.orientation) {
        return sync
          ? syncGap(playlistItem.durationSec ?? 10, "Asset unavailable")
          : null;
      }

      const selectedRendition = selectBestScreenVariant(asset.renditions, {
        width: screen.width,
        height: screen.height,
      });
      const url = selectedRendition?.url ?? asset.masterUrl;

      return {
        kind: "ASSET" as const,
        sourceKind: "ASSET" as const,
        assetId: asset.id,
        type: asset.type,
        url,
        fallbackUrls: redundantUrls(url, asset.masterUrl, asset.renditions),
        width: selectedRendition?.width ?? null,
        height: selectedRendition?.height ?? null,
        durationSeconds:
          asset.type === "VIDEO" ? asset.durationSec ?? 15 : playlistItem.durationSec ?? 10,
      };
    })
    .filter(Boolean);

  if (wall && activeWallRun?.status === "ARMED") {
    void prisma.displayWallRun
      .update({
        where: { id: activeWallRun.id },
        data: { status: "RUNNING" },
      })
      .catch(() => null);
  }

  return NextResponse.json({
    device: baseDevice,
    generatedAt: now.toISOString(),
    pollSeconds: preload ? 1 : sync ? 15 : 60,
    preload,
    sync,
    items,
  });
}
