-- Extend existing enums for wall targeting and wall-specific playlist items.
ALTER TYPE "CampaignTargetType" ADD VALUE 'WALL';
ALTER TYPE "PlaylistItemKind" ADD VALUE 'DISPLAY_WALL';

-- Add nullable wall references to existing scheduling and playlist tables.
ALTER TABLE "CampaignTarget" ADD COLUMN "wallId" TEXT;
ALTER TABLE "ScheduleWindow" ADD COLUMN "displayWallId" TEXT;
ALTER TABLE "PlaylistItem" ADD COLUMN "displayWallCreativeId" TEXT;

-- CreateTable
CREATE TABLE "DisplayWall" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 1,
    "columns" INTEGER NOT NULL DEFAULT 1,
    "canvasWidth" INTEGER NOT NULL DEFAULT 0,
    "canvasHeight" INTEGER NOT NULL DEFAULT 0,
    "syncToleranceMs" INTEGER NOT NULL DEFAULT 80,
    "timezone" TEXT NOT NULL DEFAULT 'America/Phoenix',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayWall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayWallMember" (
    "id" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayWallMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayWallCreative" (
    "id" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PROCESSING',
    "masterUrl" TEXT NOT NULL,
    "masterWidth" INTEGER NOT NULL,
    "masterHeight" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "sourceJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayWallCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayWallCreativeTile" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisplayWallCreativeTile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisplayWallMember_screenId_idx" ON "DisplayWallMember"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallMember_wallId_screenId_key" ON "DisplayWallMember"("wallId", "screenId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallMember_wallId_row_column_key" ON "DisplayWallMember"("wallId", "row", "column");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallMember_wallId_slotIndex_key" ON "DisplayWallMember"("wallId", "slotIndex");

-- CreateIndex
CREATE INDEX "DisplayWallCreative_wallId_status_createdAt_idx" ON "DisplayWallCreative"("wallId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DisplayWallCreative_sourceJobId_idx" ON "DisplayWallCreative"("sourceJobId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallCreativeTile_assetId_key" ON "DisplayWallCreativeTile"("assetId");

-- CreateIndex
CREATE INDEX "DisplayWallCreativeTile_memberId_idx" ON "DisplayWallCreativeTile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallCreativeTile_creativeId_memberId_key" ON "DisplayWallCreativeTile"("creativeId", "memberId");

-- CreateIndex
CREATE INDEX "CampaignTarget_wallId_idx" ON "CampaignTarget"("wallId");

-- CreateIndex
CREATE INDEX "ScheduleWindow_displayWallId_idx" ON "ScheduleWindow"("displayWallId");

-- CreateIndex
CREATE INDEX "PlaylistItem_displayWallCreativeId_idx" ON "PlaylistItem"("displayWallCreativeId");

-- AddForeignKey
ALTER TABLE "DisplayWallMember" ADD CONSTRAINT "DisplayWallMember_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "DisplayWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallMember" ADD CONSTRAINT "DisplayWallMember_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallCreative" ADD CONSTRAINT "DisplayWallCreative_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "DisplayWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallCreativeTile" ADD CONSTRAINT "DisplayWallCreativeTile_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "DisplayWallCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallCreativeTile" ADD CONSTRAINT "DisplayWallCreativeTile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DisplayWallMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallCreativeTile" ADD CONSTRAINT "DisplayWallCreativeTile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTarget" ADD CONSTRAINT "CampaignTarget_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "DisplayWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleWindow" ADD CONSTRAINT "ScheduleWindow_displayWallId_fkey" FOREIGN KEY ("displayWallId") REFERENCES "DisplayWall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_displayWallCreativeId_fkey" FOREIGN KEY ("displayWallCreativeId") REFERENCES "DisplayWallCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
