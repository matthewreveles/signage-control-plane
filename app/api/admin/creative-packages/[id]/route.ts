import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["DRAFT", "PROCESSING", "REVIEW", "APPROVED", "FAILED"]),
});

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid package status" }, { status: 400 });
  }

  if (parsed.data.status === "APPROVED") {
    const signageVariants = await prisma.creativeVariant.findMany({
      where: { packageId: id, destination: "SIGNAGE" },
      select: { width: true, height: true },
    });
    const hasLandscape = signageVariants.some((variant) => variant.width >= variant.height);
    const hasPortrait = signageVariants.some((variant) => variant.height > variant.width);
    if (!hasLandscape || !hasPortrait) {
      return NextResponse.json(
        { error: "Approval requires at least one landscape and one portrait signage variant" },
        { status: 400 },
      );
    }
  }

  const creativePackage = await prisma.creativePackage.update({
    where: { id },
    data: { status: parsed.data.status },
    include: {
      variants: {
        orderBy: [{ destination: "asc" }, { width: "desc" }],
        include: { asset: true },
      },
    },
  });

  return NextResponse.json(creativePackage);
}
