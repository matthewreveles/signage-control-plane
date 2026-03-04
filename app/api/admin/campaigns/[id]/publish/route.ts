import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id: campaignId } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      targets: true,
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Expand targets -> screen IDs
  const directScreenIds = campaign.targets
    .filter((t) => t.type === "SCREEN" && t.screenId)
    .map((t) => t.screenId!) as string[];

  const groupIds = campaign.targets
    .filter((t) => t.type === "GROUP" && t.groupId)
    .map((t) => t.groupId!) as string[];

  const groupMembers = groupIds.length
    ? await prisma.screenGroupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: { screenId: true },
      })
    : [];

  const groupScreenIds = groupMembers.map((m) => m.screenId);

  const screenIds = Array.from(new Set([...directScreenIds, ...groupScreenIds]));

  if (screenIds.length === 0) {
    return NextResponse.json({ error: "No target screens" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // Upsert one schedule per (campaignId, screenId)
    for (const screenId of screenIds) {
      await tx.scheduleWindow.upsert({
        where: { campaignId_screenId: { campaignId, screenId } },
        update: {
          playlistId: campaign.playlistId,
          priority: campaign.priority,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
        },
        create: {
          campaignId,
          screenId,
          playlistId: campaign.playlistId,
          priority: campaign.priority,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
        },
      });
    }

    await tx.campaign.update({
      where: { id: campaignId },
      data: { status: "PUBLISHED" },
    });
  });

  return NextResponse.json({ ok: true, publishedToScreens: screenIds.length });
}