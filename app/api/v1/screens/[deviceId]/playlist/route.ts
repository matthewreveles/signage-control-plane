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

export async function GET(req: Request, ctx: Ctx) {
  const { deviceId } = await ctx.params;

  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    include: {
      schedules: {
        include: {
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
    .filter((s: ScheduleLike) => s.startAt <= now && s.endAt >= now)
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
      generatedAt: new Date().toISOString(),
      pollSeconds: 60,
    });
  }

  const items = activeSchedule.playlist.items
    .map((pi) => {
      if (pi.kind === "COLLECTION_WIDGET") {
        if (!pi.collectionId) return null;

        const renderMode = pi.renderMode ?? "TICKER";
        const mode = modeToQuery(renderMode);

        return {
          kind: "COLLECTION_WIDGET" as const,
          collectionId: pi.collectionId,
          renderMode,
          feedUrl: `/api/v1/collections/${pi.collectionId}/feed?mode=${mode}`,
          durationSeconds: pi.durationSec ?? 15,
        };
      }

      if (pi.kind === "CREATIVE_PACKAGE") {
        const creativePackage = pi.creativePackage;
        if (!creativePackage || creativePackage.status !== "APPROVED") return null;

        const selected = selectBestScreenVariant(
          creativePackage.variants.filter(
            (variant) =>
              variant.asset.status === "READY" &&
              variant.asset.orientation === screen.orientation,
          ),
          { width: screen.width, height: screen.height },
        );
        if (!selected) return null;

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
              : pi.durationSec ?? 10,
        };
      }

      // Default: ASSET
      const asset = pi.asset;
      if (!asset) return null;

      if (asset.status !== "READY") return null;
      if (asset.orientation !== screen.orientation) return null;

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
          asset.type === "VIDEO" ? asset.durationSec ?? 15 : pi.durationSec ?? 10,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    device: baseDevice,
    generatedAt: new Date().toISOString(),
    pollSeconds: 60,
    items,
  });
}
