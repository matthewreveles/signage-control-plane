-- Factory creative packages and the first authenticated player telemetry loop.
ALTER TYPE "PlaylistItemKind" ADD VALUE IF NOT EXISTS 'CREATIVE_PACKAGE';

CREATE TYPE "CreativePackageStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'FAILED');
CREATE TYPE "CreativeDestination" AS ENUM ('SIGNAGE', 'REVIVE');

ALTER TABLE "Screen" ADD COLUMN "deviceTokenHash" TEXT;
ALTER TABLE "PlaylistItem" ADD COLUMN "creativePackageId" TEXT;
ALTER TABLE "ProofOfPlayLog" ADD COLUMN "playbackId" TEXT;

CREATE TABLE "CreativePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "campaignMessage" TEXT,
    "cta" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'GSPAN_AI_FACTORY',
    "sourceJobId" TEXT,
    "status" "CreativePackageStatus" NOT NULL DEFAULT 'REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativePackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreativeVariant" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "destination" "CreativeDestination" NOT NULL,
    "presetKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreativeVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProofOfPlayLog_playbackId_key" ON "ProofOfPlayLog"("playbackId");
CREATE INDEX "PlaylistItem_creativePackageId_idx" ON "PlaylistItem"("creativePackageId");
CREATE INDEX "CreativePackage_status_createdAt_idx" ON "CreativePackage"("status", "createdAt");
CREATE INDEX "CreativePackage_brand_createdAt_idx" ON "CreativePackage"("brand", "createdAt");
CREATE INDEX "CreativePackage_sourceJobId_idx" ON "CreativePackage"("sourceJobId");
CREATE UNIQUE INDEX "CreativeVariant_assetId_key" ON "CreativeVariant"("assetId");
CREATE UNIQUE INDEX "CreativeVariant_packageId_destination_presetKey_key" ON "CreativeVariant"("packageId", "destination", "presetKey");
CREATE INDEX "CreativeVariant_destination_width_height_idx" ON "CreativeVariant"("destination", "width", "height");

ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_creativePackageId_fkey" FOREIGN KEY ("creativePackageId") REFERENCES "CreativePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CreativePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
