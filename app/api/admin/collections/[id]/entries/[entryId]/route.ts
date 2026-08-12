import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; entryId: string }> };
type EntryStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStatus(value: unknown): value is EntryStatus {
  return value === "DRAFT" || value === "APPROVED" || value === "ARCHIVED";
}

export async function PATCH(request: Request, context: Context) {
  const { id: collectionId, entryId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const data: {
    title?: string;
    body?: string | null;
    status?: EntryStatus;
    startAt?: Date | null;
    endAt?: Date | null;
    assetId?: string | null;
  } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    data.title = title;
  }
  if (body.body !== undefined) {
    if (body.body !== null && typeof body.body !== "string") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    data.body = body.body;
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.startAt !== undefined) data.startAt = parseDate(body.startAt);
  if (body.endAt !== undefined) data.endAt = parseDate(body.endAt);
  if (body.assetId !== undefined) {
    data.assetId = typeof body.assetId === "string" && body.assetId ? body.assetId : null;
  }

  const current = await prisma.contentEntry.findFirst({
    where: { id: entryId, collectionId },
  });
  if (!current) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const startAt = data.startAt === undefined ? current.startAt : data.startAt;
  const endAt = data.endAt === undefined ? current.endAt : data.endAt;
  if (startAt && endAt && endAt <= startAt) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }

  const updated = await prisma.contentEntry.update({
    where: { id: entryId },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: Context) {
  const { id: collectionId, entryId } = await context.params;
  const result = await prisma.contentEntry.deleteMany({
    where: { id: entryId, collectionId },
  });
  if (!result.count) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
