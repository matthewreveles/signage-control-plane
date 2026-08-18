import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hasValidUploadKey } from "@/lib/upload-auth";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(
  request: Request,
  context: Context,
) {
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

  const { id } = await context.params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      renditions: true,
      _count: {
        select: {
          playlistItems: true,
          creativeVariants: true,
          contentEntries: true,
          logs: true,
        },
      },
    },
  });

  if (!asset) {
    return NextResponse.json(
      { error: "Asset not found" },
      { status: 404 },
    );
  }

  const usage =
    asset._count.playlistItems +
    asset._count.creativeVariants +
    asset._count.contentEntries +
    asset._count.logs;

  if (usage > 0) {
    return NextResponse.json(
      {
        error:
          "Asset is in use or has proof-of-play history and cannot be deleted.",
      },
      { status: 409 },
    );
  }

  const blobUrls = [
    asset.masterUrl,
    ...asset.renditions.map(
      (rendition) => rendition.url,
    ),
  ].filter(
    (url, index, values) =>
      url.includes(
        ".blob.vercel-storage.com/",
      ) && values.indexOf(url) === index,
  );

  if (blobUrls.length > 0) {
    await del(blobUrls);
  }

  await prisma.asset.delete({
    where: { id },
  });

  return NextResponse.json({
    ok: true,
  });
}
