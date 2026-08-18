import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

const playlistSchema = z.object({
  name: z.string().trim().min(1).max(180),
  items: z
    .array(
      z.object({
        assetId: z.string().trim().min(1),
        durationSec: z.number().int().min(1).max(3600),
      }),
    )
    .max(200),
});

const includePlaylist = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { asset: true },
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
  const uniqueIds = [...new Set(items.map((item) => item.assetId))];

  if (uniqueIds.length) {
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: uniqueIds },
        status: "READY",
        type: "IMAGE",
      },
      select: { id: true },
    });

    if (assets.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more assets are missing, not READY, or not IMAGE assets." },
        { status: 400 },
      );
    }
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
        data: items.map((item, index) => ({
          playlistId: id,
          kind: "ASSET" as const,
          assetId: item.assetId,
          sortOrder: index,
          durationSec: item.durationSec,
        })),
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
