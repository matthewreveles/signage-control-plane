import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const tileSchema = z.object({
  memberId: z.string().trim().min(1),
  url: z.string().url(),
  fallbackUrls: z.array(z.string().url()).max(3).default([]),
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
  codec: z.string().trim().max(80).optional().nullable(),
  bitrate: z.number().int().nonnegative().optional().nullable(),
  filesize: z.number().int().nonnegative().optional().nullable(),
});

const creativeManifestSchema = z.object({
  name: z.string().trim().min(1).max(220),
  mode: z.enum(["SPAN", "INDEPENDENT"]).default("SPAN"),
  type: z.enum(["IMAGE", "VIDEO"]),
  masterUrl: z.string().url().optional().nullable(),
  masterWidth: z.number().int().min(1).max(262144).optional().nullable(),
  masterHeight: z.number().int().min(1).max(32768).optional().nullable(),
  durationSec: z.number().int().min(1).max(3600).optional().nullable(),
  sourceJobId: z.string().trim().max(180).optional().nullable(),
  tiles: z.array(tileSchema).min(1).max(200),
});

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  const creatives = await prisma.displayWallCreative.findMany({
    where: { wallId: id },
    orderBy: { createdAt: "desc" },
    include: {
      tiles: {
        include: {
          member: { include: { screen: true } },
          asset: { include: { renditions: true } },
        },
      },
      _count: { select: { playlistItems: true } },
    },
  });

  return NextResponse.json(creatives);
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = creativeManifestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid wall scene manifest", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const wall = await prisma.displayWall.findUnique({
    where: { id },
    include: { members: { orderBy: { slotIndex: "asc" } } },
  });

  if (!wall) {
    return NextResponse.json({ error: "Display wall not found" }, { status: 404 });
  }

  if (!wall.members.length || wall.canvasWidth <= 0 || wall.canvasHeight <= 0) {
    return NextResponse.json(
      { error: "Configure the display-wall topology before importing a wall scene." },
      { status: 400 },
    );
  }

  const manifest = parsed.data;

  if (manifest.type === "VIDEO" && !manifest.durationSec) {
    return NextResponse.json(
      { error: "Video wall scenes require durationSec." },
      { status: 400 },
    );
  }

  if (
    (manifest.masterWidth === null) !== (manifest.masterHeight === null) ||
    (manifest.masterWidth === undefined) !== (manifest.masterHeight === undefined)
  ) {
    return NextResponse.json(
      { error: "masterWidth and masterHeight must be supplied together." },
      { status: 400 },
    );
  }

  if (
    manifest.masterWidth !== null &&
    manifest.masterWidth !== undefined &&
    (manifest.masterWidth !== wall.canvasWidth || manifest.masterHeight !== wall.canvasHeight)
  ) {
    return NextResponse.json(
      {
        error: `Logical master geometry must be exactly ${wall.canvasWidth}×${wall.canvasHeight} for this wall.`,
      },
      { status: 400 },
    );
  }

  const memberMap = new Map(wall.members.map((member) => [member.id, member]));
  const tileMemberIds = new Set(manifest.tiles.map((tile) => tile.memberId));

  if (
    manifest.tiles.length !== wall.members.length ||
    tileMemberIds.size !== wall.members.length
  ) {
    return NextResponse.json(
      {
        error:
          "A wall scene must contain exactly one rendered or assigned asset for every configured wall member.",
      },
      { status: 400 },
    );
  }

  for (const tile of manifest.tiles) {
    const member = memberMap.get(tile.memberId);
    if (!member) {
      return NextResponse.json(
        { error: "The scene manifest references a member that is not part of this wall." },
        { status: 400 },
      );
    }

    if (tile.width !== member.width || tile.height !== member.height) {
      return NextResponse.json(
        {
          error: `Asset for slot ${member.slotIndex + 1} must be ${member.width}×${member.height}.`,
        },
        { status: 400 },
      );
    }

    const uniqueOrigins = new Set([tile.url, ...tile.fallbackUrls]);
    if (uniqueOrigins.size !== tile.fallbackUrls.length + 1) {
      return NextResponse.json(
        { error: `Slot ${member.slotIndex + 1} contains duplicate media origins.` },
        { status: 400 },
      );
    }
  }

  const creative = await prisma.$transaction(async (transaction) => {
    const created = await transaction.displayWallCreative.create({
      data: {
        wallId: wall.id,
        name: manifest.name,
        mode: manifest.mode,
        type: manifest.type,
        status: "PROCESSING",
        masterUrl: manifest.masterUrl ?? null,
        masterWidth: manifest.masterWidth ?? null,
        masterHeight: manifest.masterHeight ?? null,
        durationSec: manifest.durationSec ?? null,
        sourceJobId: manifest.sourceJobId ?? null,
      },
    });

    for (const tile of manifest.tiles) {
      const member = memberMap.get(tile.memberId)!;
      const orientation = tile.width >= tile.height ? "LANDSCAPE" : "PORTRAIT";
      const role = manifest.mode === "SPAN" ? "wall tile" : "independent screen asset";
      const origins = [tile.url, ...tile.fallbackUrls];

      const asset = await transaction.asset.create({
        data: {
          name: `${manifest.name} · ${role} ${member.slotIndex + 1}`,
          type: manifest.type,
          orientation,
          masterUrl: tile.url,
          status: "READY",
          durationSec: manifest.type === "VIDEO" ? manifest.durationSec ?? null : null,
          renditions: {
            create: origins.map((url) => ({
              url,
              width: tile.width,
              height: tile.height,
              codec: tile.codec ?? null,
              bitrate: tile.bitrate ?? null,
              filesize: tile.filesize ?? null,
            })),
          },
        },
      });

      await transaction.displayWallCreativeTile.create({
        data: {
          creativeId: created.id,
          memberId: member.id,
          assetId: asset.id,
        },
      });
    }

    return transaction.displayWallCreative.update({
      where: { id: created.id },
      data: { status: "READY" },
      include: {
        wall: true,
        tiles: {
          include: {
            member: { include: { screen: true } },
            asset: { include: { renditions: true } },
          },
        },
      },
    });
  });

  return NextResponse.json(creative, { status: 201 });
}
