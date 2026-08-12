import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import {
  factoryPackageSchema,
  orientationFor,
  resolveVariantDimensions,
} from "@/lib/creative-packages";

export const runtime = "nodejs";

const includePackage = {
  variants: {
    orderBy: [{ destination: "asc" as const }, { width: "desc" as const }],
    include: { asset: true },
  },
};

export async function GET() {
  const packages = await prisma.creativePackage.findMany({
    orderBy: { createdAt: "desc" },
    include: includePackage,
  });

  return NextResponse.json(packages);
}

export async function POST(request: Request) {
  try {
    const input = factoryPackageSchema.parse(await request.json());

    const seen = new Set<string>();
    const variants = input.variants.map((variant) => {
      const dimensions = resolveVariantDimensions(variant);
      const uniqueKey = `${variant.destination}:${variant.presetKey}`;
      if (seen.has(uniqueKey)) {
        throw new Error(`Duplicate package variant: ${uniqueKey}`);
      }
      seen.add(uniqueKey);
      return { ...variant, ...dimensions };
    });

    const creativePackage = await prisma.$transaction(async (tx) => {
      const created = await tx.creativePackage.create({
        data: {
          name: input.name,
          brand: input.brand,
          campaignMessage: input.campaignMessage || null,
          cta: input.cta || null,
          sourceSystem: input.sourceSystem,
          sourceJobId: input.sourceJobId || null,
          status: input.status,
        },
      });

      for (const variant of variants) {
        const asset = await tx.asset.create({
          data: {
            name: variant.name,
            type: variant.type,
            orientation: orientationFor(variant.width, variant.height),
            masterUrl: variant.url,
            status: "READY",
            durationSec:
              variant.type === "VIDEO" ? variant.durationSec ?? null : null,
          },
        });

        await tx.creativeVariant.create({
          data: {
            packageId: created.id,
            assetId: asset.id,
            destination: variant.destination,
            presetKey: variant.presetKey,
            width: variant.width,
            height: variant.height,
          },
        });
      }

      return tx.creativePackage.findUniqueOrThrow({
        where: { id: created.id },
        include: includePackage,
      });
    });

    return NextResponse.json(creativePackage, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid Factory package manifest", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Package import failed" },
      { status: 400 },
    );
  }
}
