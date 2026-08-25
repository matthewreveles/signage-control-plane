// app/api/v1/screens/[deviceId]/playlist/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestHasValidDeviceToken } from "@/lib/device-auth";
import { selectBestScreenVariant } from "@/lib/creative-packages";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ deviceId: string }> };

type ScheduleLike = {
  startAt: Date;
  endAt: Date;
  priority: number;
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

export async function GET(req: Request, ctx: Ctx) {
  const { deviceId } = await ctx.params;

  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    include: {
      schedules: {
        include: {
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

  const now = new Date();

  const activeSchedule = screen.schedules
    .filter((schedule: ScheduleLike) => schedule.startAt <= now && schedule.endAt >= now)
    .sort((a: ScheduleLike, b: ScheduleLike) => b.priority - a.priority)[0];

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

  if (!activeSchedule) {
    return NextResponse.json({
      device: baseDevice,
      items: [],
      sync: null,
      generatedAt: now.toISOString(),
      pollSeconds: 60,
    });
  }

  const wall = activeSchedule.displayWall;
  const wallMember = wall?.members.find((member) => member.screenId === screen.id) ?? null;
  const sync = wall
    ? {
        mode: "DISPLAY_WALL" as const,
        wallId: wall.id,
        wallName: wall.name,
        epochMs: activeSchedule.startAt.getTime(),
        serverNowMs: now.getTime(),
        toleranceMs: wall.syncToleranceMs,
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
          return sync ? syncGap(durationSeconds, "Wall creative unavailable") : null;
        }
        if (creative.wallId !== sync.wallId) {
          return syncGap(durationSeconds, "Wall creative targets a different wall");
        }

        const tile = creative.tiles.find(
          (candidate) => candidate.member.screenId === screen.id,
        );
        if (!tile || tile.asset.status !== "READY") {
          return syncGap(durationSeconds, "Wall tile unavailable");
        }

        const selectedRendition = selectBestScreenVariant(
          tile.asset.renditions,
          { width: screen.width, height: screen.height },
        );

        return {
          kind: "ASSET" as const,
          sourceKind: "DISPLAY_WALL" as const,
          wallId: creative.wallId,
          wallCreativeId: creative.id,
          wallCreativeName: creative.name,
          slotIndex: tile.member.slotIndex,
          assetId: tile.asset.id,
          type: tile.asset.type,
          url: selectedRendition?.url ?? tile.asset.masterUrl,
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
          packageId: creativePackage.id,
          packageName: creativePackage.name,
          brand: creativePackage.brand,
          variantId: selected.id,
          presetKey: selected.presetKey,
          assetId: selected.asset.id,
          type: selected.asset.type,
          url: selected.asset.masterUrl,
          width: selected.width,
          height: selected.height,
          durationSeconds:
            selected.asset.type === "VIDEO"
              ? selected.asset.durationSec ?? 15
              : playlistItem.durationSec ?? 10,
        };
      }

      // Default: ASSET
      const asset = playlistItem.asset;
      if (!asset || asset.status !== "READY" || asset.orientation !== screen.orientation) {
        return sync
          ? syncGap(playlistItem.durationSec ?? 10, "Asset unavailable")
          : null;
      }

      const selectedRendition = selectBestScreenVariant(
        asset.renditions,
        { width: screen.width, height: screen.height },
      );

      return {
        kind: "ASSET" as const,
        sourceKind: "ASSET" as const,
        assetId: asset.id,
        type: asset.type,
        url: selectedRendition?.url ?? asset.masterUrl,
        width: selectedRendition?.width ?? null,
        height: selectedRendition?.height ?? null,
        durationSeconds:
          asset.type === "VIDEO" ? asset.durationSec ?? 15 : playlistItem.durationSec ?? 10,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    device: baseDevice,
    generatedAt: now.toISOString(),
    pollSeconds: sync ? 15 : 60,
    sync,
    items,
  });
}
