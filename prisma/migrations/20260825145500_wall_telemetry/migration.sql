-- CreateEnum
CREATE TYPE "DisplayWallCorrectionMode" AS ENUM ('NONE', 'SOFT', 'HARD');

-- CreateEnum
CREATE TYPE "DisplayWallPlaybackTransport" AS ENUM ('LOCAL_FILE', 'BROWSER_CACHE', 'NETWORK');

-- CreateTable
CREATE TABLE "DisplayWallTelemetry" (
    "id" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "campaignId" TEXT,
    "occurrenceKey" TEXT,
    "manifestVersion" TEXT,
    "sceneMode" "DisplayWallSceneMode",
    "currentAssetId" TEXT,
    "currentItemIndex" INTEGER,
    "driftMs" INTEGER,
    "clockOffsetMs" INTEGER,
    "correctionMode" "DisplayWallCorrectionMode" NOT NULL DEFAULT 'NONE',
    "transport" "DisplayWallPlaybackTransport" NOT NULL DEFAULT 'NETWORK',
    "cacheReady" BOOLEAN NOT NULL DEFAULT false,
    "cachedAssets" INTEGER NOT NULL DEFAULT 0,
    "cacheBytesMb" INTEGER NOT NULL DEFAULT 0,
    "storageFreeMb" INTEGER,
    "sourceFailovers" INTEGER NOT NULL DEFAULT 0,
    "hardResyncs" INTEGER NOT NULL DEFAULT 0,
    "playerVersion" TEXT,
    "lastError" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayWallTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallTelemetry_wallId_screenId_key"
ON "DisplayWallTelemetry"("wallId", "screenId");

-- CreateIndex
CREATE INDEX "DisplayWallTelemetry_wallId_observedAt_idx"
ON "DisplayWallTelemetry"("wallId", "observedAt");

-- CreateIndex
CREATE INDEX "DisplayWallTelemetry_screenId_observedAt_idx"
ON "DisplayWallTelemetry"("screenId", "observedAt");

-- CreateIndex
CREATE INDEX "DisplayWallTelemetry_campaignId_occurrenceKey_idx"
ON "DisplayWallTelemetry"("campaignId", "occurrenceKey");

-- AddForeignKey
ALTER TABLE "DisplayWallTelemetry"
ADD CONSTRAINT "DisplayWallTelemetry_wallId_fkey"
FOREIGN KEY ("wallId") REFERENCES "DisplayWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallTelemetry"
ADD CONSTRAINT "DisplayWallTelemetry_screenId_fkey"
FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallTelemetry"
ADD CONSTRAINT "DisplayWallTelemetry_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallTelemetry"
ADD CONSTRAINT "DisplayWallTelemetry_currentAssetId_fkey"
FOREIGN KEY ("currentAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
