import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id: groupId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const screenId = typeof body.screenId === "string" ? body.screenId : "";
  const action = typeof body.action === "string" ? body.action : "add";

  if (!screenId) return NextResponse.json({ error: "screenId is required" }, { status: 400 });

  if (action === "remove") {
    await prisma.screenGroupMember.deleteMany({ where: { groupId, screenId } });
    return NextResponse.json({ ok: true });
  }

  // add
  const member = await prisma.screenGroupMember.upsert({
    where: { groupId_screenId: { groupId, screenId } },
    update: {},
    create: { groupId, screenId },
  });

  return NextResponse.json(member);
}