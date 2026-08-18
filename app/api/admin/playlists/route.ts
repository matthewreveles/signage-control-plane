import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const playlistSchema = z.object({
  name: z.string().trim().min(1).max(180),
  items: z
    .array(
      z.object({
        assetId: z.string().trim().min(1),
        durationSec: z.number().int().min(1).max(3600),
      }),
    )
    .max(200)
    .default([]),
});

const includePlaylist = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { asset: true },
  },
};

async function validateAssets(assetIds: string[]) {
  const uniqueIds = [...new Set(assetIds)];

  if (!uniqueIds.length) return true;

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: uniqueIds },
      status: "READY",
      type: "IMAGE",
    },
    select: { id: true },
  });

  return assets.length === uniqueIds.length;
}

export async function GET() {
  const playlists = await prisma.playlist.findMany({
    orderBy: { createdAt: "desc" },
    include: includePlaylist,
  });

  return NextResponse.json(playlists);
}

export async function POST(request: Request) {
  const parsed = playlistSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid playlist", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, items } = parsed.data;

  if (!(await validateAssets(items.map((item) => item.assetId)))) {
    return NextResponse.json(
      { error: "One or more assets are missing, not READY, or not IMAGE assets." },
      { status: 400 },
    );
  }

  const playlist = await prisma.playlist.create({
    data: {
      name,
      items: {
        create: items.map((item, index) => ({
          kind: "ASSET",
          assetId: item.assetId,
          sortOrder: index,
          durationSec: item.durationSec,
        })),
      },
    },
    include: includePlaylist,
  });

  return NextResponse.json(playlist, { status: 201 });
}
