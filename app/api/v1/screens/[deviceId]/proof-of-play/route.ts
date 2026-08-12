import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requestHasValidDeviceToken } from "@/lib/device-auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ deviceId: string }> };

const proofSchema = z.object({
  events: z.array(
    z.object({
      playbackId: z.string().trim().min(8).max(160),
      assetId: z.string().trim().min(1).max(180),
      startedAt: z.string().datetime(),
      endedAt: z.string().datetime(),
      durationSec: z.number().int().min(1).max(86_400),
    }),
  ).min(1).max(100),
});

export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    select: { id: true, deviceTokenHash: true },
  });
  if (!screen) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }
  if (!requestHasValidDeviceToken(request, screen.deviceTokenHash)) {
    return NextResponse.json({ error: "Invalid device token" }, { status: 401 });
  }

  const parsed = proofSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid proof-of-play payload" }, { status: 400 });
  }

  const assetIds = [...new Set(parsed.data.events.map((event) => event.assetId))];
  const existingAssets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true },
  });
  const existingAssetIds = new Set(existingAssets.map((asset) => asset.id));

  const validEvents = parsed.data.events.filter((event) => {
    const start = new Date(event.startedAt);
    const end = new Date(event.endedAt);
    return existingAssetIds.has(event.assetId) && end > start;
  });

  const result = await prisma.proofOfPlayLog.createMany({
    data: validEvents.map((event) => ({
      playbackId: event.playbackId,
      screenId: screen.id,
      assetId: event.assetId,
      startedAt: new Date(event.startedAt),
      endedAt: new Date(event.endedAt),
      durationSec: event.durationSec,
    })),
    skipDuplicates: true,
  });

  await prisma.screen.update({
    where: { id: screen.id },
    data: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ accepted: result.count, received: parsed.data.events.length });
}
