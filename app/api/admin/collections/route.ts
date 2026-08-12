import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type CollectionType = "MENU" | "DROPS" | "EVENTS";

function isCollectionType(value: string): value is CollectionType {
  return value === "MENU" || value === "DROPS" || value === "EVENTS";
}

export async function GET() {
  const collections = await prisma.contentCollection.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      entries: {
        orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
        take: 25,
      },
    },
  });
  return NextResponse.json(collections);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isCollectionType(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const c = await prisma.contentCollection.create({
    data: {
      name,
      type,
      description: typeof body.description === "string" ? body.description.trim() : null,
    },
  });

  return NextResponse.json(c);
}
