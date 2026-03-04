// app/api/v1/collections/[collectionId]/feed/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ collectionId: string }> };

function parseIntParam(v: string | null, def: number, min: number, max: number) {
  const n = v ? Number(v) : def;
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeMode(v: string | null) {
  const m = (v ?? "ticker").toLowerCase();
  if (m === "list") return "list";
  if (m === "grid") return "grid";
  return "ticker";
}

export async function GET(req: Request, ctx: Ctx) {
  const { collectionId } = await ctx.params;
  const url = new URL(req.url);

  const mode = normalizeMode(url.searchParams.get("mode"));
  const limit = parseIntParam(url.searchParams.get("limit"), 10, 1, 50);

  const now = new Date();

  const collection = await prisma.contentCollection.findUnique({
    where: { id: collectionId },
    select: { id: true, name: true, type: true, description: true },
  });

  if (!collection) {
    return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  }

  const entries = await prisma.contentEntry.findMany({
    where: {
      collectionId,
      status: "APPROVED",
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ],
    },
    orderBy: [
      // If Prisma complains about nulls, remove `nulls` and keep `startAt: "asc"`
      { startAt: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: limit,
    include: {
      asset: true,
    },
  });

  const items = entries.map((e) => ({
    id: e.id,
    title: e.title,
    body: e.body,
    startAt: e.startAt ? e.startAt.toISOString() : null,
    endAt: e.endAt ? e.endAt.toISOString() : null,
    asset:
      e.asset && e.asset.status === "READY"
        ? {
            id: e.asset.id,
            name: e.asset.name,
            type: e.asset.type,
            masterUrl: e.asset.masterUrl,
            orientation: e.asset.orientation,
            durationSec: e.asset.durationSec ?? null,
          }
        : null,
  }));

  return NextResponse.json({
    collection,
    mode,
    generatedAt: new Date().toISOString(),
    items,
  });
}