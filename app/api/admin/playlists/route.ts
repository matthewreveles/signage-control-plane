import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const assetItemSchema = z.object({
  kind: z.literal("ASSET").default("ASSET"),
  assetId: z.string().trim().min(1),
  durationSec: z.number().int().min(1).max(3600),
});

const displayWallItemSchema = z.object({
  kind: z.literal("DISPLAY_WALL"),
  displayWallCreativeId: z.string().trim().min(1),
  durationSec: z.number().int().min(1).max(3600),
});

const playlistSchema = z.object({
  name: z.string().trim().min(1).max(180),
  items: z
    .array(z.union([assetItemSchema, displayWallItemSchema]))
    .max(200)
    .default([]),
});

const includePlaylist = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      asset: true,
      displayWallCreative: {
        include: { wall: true },
      },
    },
  },
};

async function validateItems(items: z.infer<typeof playlistSchema>["items"]) {
  const assetIds = [
    ...new Set(
      items.flatMap((item) => (item.kind === "ASSET" ? [item.assetId] : [])),
    ),
  ];
  const wallCreativeIds = [
    ...new Set(
      items.flatMap((item) =>
        item.kind === "DISPLAY_WALL" ? [item.displayWallCreativeId] : [],
      ),
    ),
  ];

  const [assets, wallCreatives] = await Promise.all([
    assetIds.length
      ? prisma.asset.findMany({
          where: {
            id: { in: assetIds },
            status: "READY",
            type: "IMAGE",
          },
          select: { id: true },
        })
      : [],
    wallCreativeIds.length
      ? prisma.displayWallCreative.findMany({
          where: {
            id: { in: wallCreativeIds },
            status: "READY",
          },
          select: { id: true },
        })
      : [],
  ]);

  if (assets.length !== assetIds.length) {
    throw new Error("One or more assets are missing, not READY, or not IMAGE assets.");
  }
  if (wallCreatives.length !== wallCreativeIds.length) {
    throw new Error("One or more display-wall creatives are missing or not READY.");
  }
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

  try {
    await validateItems(items);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid playlist items" },
      { status: 400 },
    );
  }

  const playlist = await prisma.playlist.create({
    data: {
      name,
      items: {
        create: items.map((item, index) =>
          item.kind === "DISPLAY_WALL"
            ? {
                kind: "DISPLAY_WALL",
                displayWallCreativeId: item.displayWallCreativeId,
                sortOrder: index,
                durationSec: item.durationSec,
              }
            : {
                kind: "ASSET",
                assetId: item.assetId,
                sortOrder: index,
                durationSec: item.durationSec,
              },
        ),
      },
    },
    include: includePlaylist,
  });

  return NextResponse.json(playlist, { status: 201 });
}
