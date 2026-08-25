-- CreateEnum
CREATE TYPE "DisplayWallSceneMode" AS ENUM ('SPAN', 'INDEPENDENT');

-- CreateEnum
CREATE TYPE "DisplayWallFailurePolicy" AS ENUM ('HOLD_LAST_READY', 'FALLBACK_STANDARD');

-- CreateEnum
CREATE TYPE "DisplayWallReadinessStatus" AS ENUM ('PRELOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DisplayWallRunStatus" AS ENUM ('PREPARING', 'ARMED', 'RUNNING', 'BLOCKED', 'COMPLETE');

-- AlterTable
ALTER TABLE "DisplayWall"
  ADD COLUMN "hardResyncMs" INTEGER NOT NULL DEFAULT 350,
  ADD COLUMN "preloadLeadSec" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "startGuardMs" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "requireAllMembersReady" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "failurePolicy" "DisplayWallFailurePolicy" NOT NULL DEFAULT 'HOLD_LAST_READY';

-- AlterTable
ALTER TABLE "DisplayWallCreative"
  ADD COLUMN "mode" "DisplayWallSceneMode" NOT NULL DEFAULT 'SPAN',
  ALTER COLUMN "masterUrl" DROP NOT NULL,
  ALTER COLUMN "masterWidth" DROP NOT NULL,
  ALTER COLUMN "masterHeight" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DisplayWallReadinessAck" (
    "id" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "status" "DisplayWallReadinessStatus" NOT NULL DEFAULT 'PRELOADING',
    "error" TEXT,
    "cachedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayWallReadinessAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayWallRun" (
    "id" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "manifestVersion" TEXT NOT NULL,
    "status" "DisplayWallRunStatus" NOT NULL DEFAULT 'PREPARING',
    "releaseAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayWallRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallReadinessAck_wallId_campaignId_occurrenceKey_screenId_key"
ON "DisplayWallReadinessAck"("wallId", "campaignId", "occurrenceKey", "screenId");

-- CreateIndex
CREATE INDEX "DisplayWallReadinessAck_wallId_campaignId_occurrenceKey_manifestVersion_status_idx"
ON "DisplayWallReadinessAck"("wallId", "campaignId", "occurrenceKey", "manifestVersion", "status");

-- CreateIndex
CREATE INDEX "DisplayWallReadinessAck_screenId_updatedAt_idx"
ON "DisplayWallReadinessAck"("screenId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayWallRun_wallId_campaignId_occurrenceKey_key"
ON "DisplayWallRun"("wallId", "campaignId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "DisplayWallRun_wallId_status_releaseAt_idx"
ON "DisplayWallRun"("wallId", "status", "releaseAt");

-- CreateIndex
CREATE INDEX "DisplayWallCreative_wallId_mode_status_idx"
ON "DisplayWallCreative"("wallId", "mode", "status");

-- AddForeignKey
ALTER TABLE "DisplayWallReadinessAck"
ADD CONSTRAINT "DisplayWallReadinessAck_wallId_fkey"
FOREIGN KEY ("wallId") REFERENCES "DisplayWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallReadinessAck"
ADD CONSTRAINT "DisplayWallReadinessAck_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallReadinessAck"
ADD CONSTRAINT "DisplayWallReadinessAck_screenId_fkey"
FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallRun"
ADD CONSTRAINT "DisplayWallRun_wallId_fkey"
FOREIGN KEY ("wallId") REFERENCES "DisplayWall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayWallRun"
ADD CONSTRAINT "DisplayWallRun_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
