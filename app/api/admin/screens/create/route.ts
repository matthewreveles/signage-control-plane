// src/app/api/admin/screens/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

async function getNextScreenNumber(): Promise<number> {
  const last = await prisma.screen.findFirst({
    orderBy: { screenNumber: "desc" },
    select: { screenNumber: true },
  });

  return (last?.screenNumber ?? 0) + 1;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  for (let attempt = 0; attempt < 5; attempt++) {
    const n = await getNextScreenNumber();

    try {
      const screen = await prisma.screen.create({
        data: {
          screenNumber: n,
          name: typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : `Screen ${pad2(n)}`,
          activationCode: randomCode(),
          orientation: body.orientation ?? "LANDSCAPE",
          width: body.width ?? 1920,
          height: body.height ?? 1080,
          timezone: body.timezone ?? "America/Phoenix",
        },
      });

      return NextResponse.json(screen);
    } catch (err: any) {
      // Prisma unique constraint violation (screenNumber collision)
      if (err?.code === "P2002") continue;
      throw err;
    }
  }

  return NextResponse.json(
    { error: "Failed to allocate a unique screen number" },
    { status: 500 }
  );
}