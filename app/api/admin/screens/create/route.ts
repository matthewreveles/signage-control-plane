import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
export const runtime = "nodejs";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const screen = await prisma.screen.create({
    data: {
      name: body.name ?? "Test Screen",
      activationCode: randomCode(),
      orientation: body.orientation ?? "LANDSCAPE",
      width: body.width ?? 1920,
      height: body.height ?? 1080,
      timezone: body.timezone ?? "America/Phoenix",
    },
  });

  return NextResponse.json(screen);
}