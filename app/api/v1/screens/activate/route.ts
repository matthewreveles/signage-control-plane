import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createDeviceToken, hashDeviceToken } from "@/lib/device-auth";

export const runtime = "nodejs";

const activationSchema = z.object({
  activationCode: z.string().trim().min(6).max(32),
  deviceId: z.string().trim().min(3).max(120).optional(),
});

export async function POST(request: Request) {
  const parsed = activationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid activation code is required" }, { status: 400 });
  }

  const screen = await prisma.screen.findUnique({
    where: { activationCode: parsed.data.activationCode.toUpperCase() },
  });
  if (!screen) {
    return NextResponse.json({ error: "Activation code not found" }, { status: 404 });
  }

  const requestedDeviceId = parsed.data.deviceId ?? randomUUID();
  if (screen.deviceId && screen.deviceId !== requestedDeviceId) {
    return NextResponse.json(
      { error: "This screen is already paired. Reset it in the control plane first." },
      { status: 409 },
    );
  }

  const token = createDeviceToken();
  const updated = await prisma.screen.update({
    where: { id: screen.id },
    data: {
      deviceId: requestedDeviceId,
      deviceTokenHash: hashDeviceToken(token),
      lastSeenAt: new Date(),
    },
    select: {
      deviceId: true,
      screenNumber: true,
      name: true,
      orientation: true,
      width: true,
      height: true,
      timezone: true,
    },
  });

  return NextResponse.json({ ...updated, token });
}
