import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};

  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = n;
  }

  if (body.description !== undefined) {
    if (body.description === null) data.description = null;
    else if (typeof body.description === "string") data.description = body.description.trim() || null;
    else return NextResponse.json({ error: "Invalid description" }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.contentCollection.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.contentCollection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}