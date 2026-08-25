import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

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
  items: z.array(z.union([assetItemSchema, displayWallItemSchema])).max(200),
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

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;

  const parsed = playlistSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid playlist", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.playlist.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Playlist not found" },
      { status: 404 },
    );
  }

  const { name, items } = parsed.data;
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
    return NextResponse.json(
      { error: "One or more assets are missing, not READY, or not IMAGE assets." },
      { status: 400 },
    );
  }
  if (wallCreatives.length !== wallCreativeIds.length) {
    return NextResponse.json(
      { error: "One or more display-wall creatives are missing or not READY." },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.playlist.update({
      where: { id },
      data: { name },
    });

    await tx.playlistItem.deleteMany({
      where: { playlistId: id },
    });

    if (items.length) {
      await tx.playlistItem.createMany({
        data: items.map((item, index) =>
          item.kind === "DISPLAY_WALL"
            ? {
                playlistId: id,
                kind: "DISPLAY_WALL" as const,
                displayWallCreativeId: item.displayWallCreativeId,
                sortOrder: index,
                durationSec: item.durationSec,
              }
            : {
                playlistId: id,
                kind: "ASSET" as const,
                assetId: item.assetId,
                sortOrder: index,
                durationSec: item.durationSec,
              },
        ),
      });
    }

    return tx.playlist.findUniqueOrThrow({
      where: { id },
      include: includePlaylist,
    });
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;

  const [campaignCount, scheduleCount] = await Promise.all([
    prisma.campaign.count({ where: { playlistId: id } }),
    prisma.scheduleWindow.count({ where: { playlistId: id } }),
  ]);

  if (campaignCount || scheduleCount) {
    return NextResponse.json(
      {
        error:
          "This playlist is already referenced by a campaign or schedule and cannot be deleted.",
      },
      { status: 409 },
    );
  }

  await prisma.playlist.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true });
}
