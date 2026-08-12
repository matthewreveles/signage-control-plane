import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(_request: Request, context: Context) {
  const { id: collectionId } = await context.params;
  const entries = await prisma.contentEntry.findMany({
    where: { collectionId },
    orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(request: Request, context: Context) {
  const { id: collectionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const startAt = parseDate(body.startAt);
  const endAt = parseDate(body.endAt);
  if (startAt && endAt && endAt <= startAt) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }

  const entry = await prisma.contentEntry.create({
    data: {
      collectionId,
      title,
      body: typeof body.body === "string" ? body.body : null,
      status: "DRAFT",
      startAt,
      endAt,
      assetId: typeof body.assetId === "string" ? body.assetId : null,
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
