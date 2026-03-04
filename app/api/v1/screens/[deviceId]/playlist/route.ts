// app/api/v1/screens/[deviceId]/playlist/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
                include: { asset: true, collection: true },
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

      // Default: ASSET
      const asset = pi.asset;
      if (!asset) return null;

      if (asset.status !== "READY") return null;
      if (asset.orientation !== screen.orientation) return null;

      return {
        kind: "ASSET" as const,
        assetId: asset.id,
        type: asset.type,
        url: asset.masterUrl,
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