import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

function parseDate(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isStatus(v: unknown): v is "DRAFT" | "APPROVED" | "ARCHIVED" {
  return v === "DRAFT" || v === "APPROVED" || v === "ARCHIVED";
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: collectionId, entryId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    data.title = t;
  }

  if (body.body !== undefined) {
    if (body.body === null) data.body = null;
    else if (typeof body.body === "string") data.body = body.body;
    else return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.status !== undefined) {
    if (!isStatus(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    data.status = body.status;
  }

  if (body.startAt !== undefined) data.startAt = parseDate(body.startAt);
  if (body.endAt !== undefined) data.endAt = parseDate(body.endAt);

  if (data.startAt && data.endAt && data.endAt <= data.startAt) {
    return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
  }

  if (body.assetId !== undefined) {
    if (body.assetId === null || body.assetId === "") data.assetId = null;
    else if (typeof body.assetId === "string") data.assetId = body.assetId;
    else return NextResponse.json({ error: "Invalid assetId" }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.contentEntry.update({
    where: { id: entryId },
    data,
  });

  // safety: ensure it belongs to that collection
  if (updated.collectionId !== collectionId) {
    return NextResponse.json({ error: "Entry does not belong to this collection" }, { status: 400 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: collectionId, entryId } = await ctx.params;

  const existing = await prisma.contentEntry.findUnique({ where: { id: entryId } });
  if (!existing) return NextResponse.json({ ok: true });

  if (existing.collectionId !== collectionId) {
    return NextResponse.json({ error: "Entry does not belong to this collection" }, { status: 400 });
  }

  await prisma.contentEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}