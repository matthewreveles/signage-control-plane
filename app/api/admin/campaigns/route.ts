import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    include: {
      playlist: true,
      targets: true,
    },
  });

  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const startAt = parseDate(body.startAt);
  const endAt = parseDate(body.endAt);
  if (!startAt || !endAt) {
    return NextResponse.json({ error: "startAt/endAt required" }, { status: 400 });
  }
  if (endAt <= startAt) {
    return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
  }

  const timezone =
    typeof body.timezone === "string" && body.timezone.trim()
      ? body.timezone.trim()
      : "America/Phoenix";

  const priority =
    typeof body.priority === "number" && Number.isInteger(body.priority)
      ? body.priority
      : 10;

  const screenIds: string[] = Array.isArray(body.screenIds)
    ? body.screenIds.filter((x: unknown) => typeof x === "string")
    : [];

  const groupIds: string[] = Array.isArray(body.groupIds)
    ? body.groupIds.filter((x: unknown) => typeof x === "string")
    : [];

  const playlistId = typeof body.playlistId === "string" ? body.playlistId : null;
  const assetId = typeof body.assetId === "string" ? body.assetId : null;
  const creativePackageId =
    typeof body.creativePackageId === "string" ? body.creativePackageId : null;

  if (!playlistId && !assetId && !creativePackageId) {
    return NextResponse.json(
      { error: "Provide playlistId, assetId or creativePackageId" },
      { status: 400 },
    );
  }

  // Assets and Factory packages each become a one-item playlist behind the scenes.
  const resolvedPlaylistId = await prisma.$transaction(async (tx) => {
    if (playlistId) return playlistId;

    const asset = assetId
      ? await tx.asset.findUnique({ where: { id: assetId } })
      : null;
    if (assetId && !asset) throw new Error("Unknown assetId");

    const creativePackage = creativePackageId
      ? await tx.creativePackage.findUnique({ where: { id: creativePackageId } })
      : null;
    if (creativePackageId && !creativePackage) {
      throw new Error("Unknown creativePackageId");
    }
    if (creativePackage && creativePackage.status !== "APPROVED") {
      throw new Error("Creative package must be approved before scheduling");
    }

    const pl = await tx.playlist.create({
      data: { name: `Campaign Playlist: ${name}` },
    });

    await tx.playlistItem.create({
      data: {
        playlistId: pl.id,
        kind: creativePackage ? "CREATIVE_PACKAGE" : "ASSET",
        assetId: asset?.id ?? null,
        creativePackageId: creativePackage?.id ?? null,
        sortOrder: 0,
        durationSec: asset?.type === "IMAGE" || creativePackage ? 10 : null,
      },
    });

    return pl.id;
  });

  const campaign = await prisma.campaign.create({
    data: {
      name,
      timezone,
      priority,
      startAt,
      endAt,
      playlistId: resolvedPlaylistId,
      targets: {
        create: [
          ...screenIds.map((screenId) => ({ type: "SCREEN" as const, screenId })),
          ...groupIds.map((groupId) => ({ type: "GROUP" as const, groupId })),
        ],
      },
    },
    include: {
      playlist: true,
      targets: true,
    },
  });

  return NextResponse.json(campaign);
}
