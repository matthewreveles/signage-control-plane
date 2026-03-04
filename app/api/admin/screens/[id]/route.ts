import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function isOrientation(v: unknown): v is "LANDSCAPE" | "PORTRAIT" {
  return v === "LANDSCAPE" || v === "PORTRAIT";
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const data: {
    name?: string;
    orientation?: "LANDSCAPE" | "PORTRAIT";
    width?: number;
    height?: number;
    timezone?: string;
  } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      );
    }
    data.name = name;
  }

  if (body.orientation !== undefined) {
    if (!isOrientation(body.orientation)) {
      return NextResponse.json({ error: "Invalid orientation" }, { status: 400 });
    }
    data.orientation = body.orientation;
  }

  if (body.width !== undefined) {
    if (!isInt(body.width) || body.width < 320 || body.width > 7680) {
      return NextResponse.json({ error: "Invalid width" }, { status: 400 });
    }
    data.width = body.width;
  }

  if (body.height !== undefined) {
    if (!isInt(body.height) || body.height < 320 || body.height > 7680) {
      return NextResponse.json({ error: "Invalid height" }, { status: 400 });
    }
    data.height = body.height;
  }

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !body.timezone.trim()) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
    data.timezone = body.timezone.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.screen.update({
    where: { id },
    data,
    select: {
      id: true,
      screenNumber: true,
      name: true,
      deviceId: true,
      activationCode: true,
      orientation: true,
      width: true,
      height: true,
      timezone: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}