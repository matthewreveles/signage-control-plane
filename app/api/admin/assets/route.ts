import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { hasValidUploadKey } from "@/lib/upload-auth";

export const runtime = "nodejs";

const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(220),
  url: z.string().url(),
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
  filesize: z.number().int().nonnegative().optional(),
  contentType: z.string().trim().max(120).optional(),
});

const includeAsset = {
  renditions: true,
  _count: {
    select: {
      playlistItems: true,
      creativeVariants: true,
      contentEntries: true,
      logs: true,
    },
  },
};

export async function GET() {
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
    include: includeAsset,
    take: 500,
  });

  return NextResponse.json(assets);
}

export async function POST(request: Request) {
  if (
    !hasValidUploadKey(
      request.headers.get("x-gspan-upload-key"),
    )
  ) {
    return NextResponse.json(
      { error: "Invalid upload key" },
      { status: 401 },
    );
  }

  const parsed = createAssetSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid asset metadata",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const {
    name,
    url,
    width,
    height,
    filesize,
    contentType,
  } = parsed.data;

  const orientation =
    width >= height ? "LANDSCAPE" : "PORTRAIT";

  const codec =
    contentType?.split("/")[1]?.toLowerCase() ?? null;

  const asset = await prisma.asset.create({
    data: {
      name,
      type: "IMAGE",
      orientation,
      masterUrl: url,
      status: "READY",
      renditions: {
        create: {
          url,
          width,
          height,
          filesize: filesize ?? null,
          codec,
        },
      },
    },
    include: includeAsset,
  });

  return NextResponse.json(asset, {
    status: 201,
  });
}
