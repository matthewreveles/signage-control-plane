import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const groups = await prisma.screenGroup.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { screen: true } },
    },
  });
  return NextResponse.json(groups);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const group = await prisma.screenGroup.create({
    data: {
      name,
      description: typeof body.description === "string" ? body.description.trim() : null,
    },
  });

  return NextResponse.json(group);
}