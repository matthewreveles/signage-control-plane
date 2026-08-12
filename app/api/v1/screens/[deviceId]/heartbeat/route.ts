import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestHasValidDeviceToken } from "@/lib/device-auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ deviceId: string }> };

export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const screen = await prisma.screen.findUnique({
    where: { deviceId },
    select: { id: true, deviceTokenHash: true },
  });
  if (!screen) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }
  if (!requestHasValidDeviceToken(request, screen.deviceTokenHash)) {
    return NextResponse.json({ error: "Invalid device token" }, { status: 401 });
  }

  const seenAt = new Date();
  await prisma.screen.update({ where: { id: screen.id }, data: { lastSeenAt: seenAt } });
  return NextResponse.json({ ok: true, seenAt: seenAt.toISOString() });
}
