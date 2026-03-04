import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseDate(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id: collectionId } = await ctx.params;

  const entries = await prisma.contentEntry.findMany({
    where: { collectionId },
    orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: collectionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const entry = await prisma.contentEntry.create({
    data: {
      collectionId,
      title,
      body: typeof body.body === "string" ? body.body : null,
      status: "DRAFT",
      startAt: parseDate(body.startAt),
      endAt: parseDate(body.endAt),
      assetId: typeof body.assetId === "string" ? body.assetId : null,
    },
  });

  return NextResponse.json(entry);
}