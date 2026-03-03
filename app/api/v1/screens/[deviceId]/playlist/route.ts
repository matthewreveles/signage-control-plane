import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { deviceId: string } }
) {
  const screen = await prisma.screen.findUnique({
    where: { deviceId: params.deviceId },
    include: {
      schedules: {
        include: {
          playlist: {
            include: {
              items: {
                include: { asset: true },
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
    .filter((s) => s.startAt <= now && s.endAt >= now)
    .sort((a, b) => b.priority - a.priority)[0];

  if (!activeSchedule) {
    return NextResponse.json({
      device: {
        deviceId: screen.deviceId,
        orientation: screen.orientation,
      },
      items: [],
      pollSeconds: 60,
    });
  }

  const items = activeSchedule.playlist.items
    .filter(
      (pi) =>
        pi.asset.status === "READY" &&
        pi.asset.orientation === screen.orientation
    )
    .map((pi) => ({
      assetId: pi.asset.id,
      type: pi.asset.type,
      url: pi.asset.masterUrl, // MVP: use master directly
      durationSeconds:
        pi.asset.type === "VIDEO"
          ? pi.asset.durationSec ?? 15
          : pi.durationSec ?? 10,
    }));

  return NextResponse.json({
    device: {
      deviceId: screen.deviceId,
      orientation: screen.orientation,
      width: screen.width,
      height: screen.height,
      timezone: screen.timezone,
    },
    generatedAt: new Date().toISOString(),
    pollSeconds: 60,
    items,
  });
}