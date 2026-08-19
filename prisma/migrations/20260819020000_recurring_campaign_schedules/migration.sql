-- CreateEnum
CREATE TYPE "CampaignScheduleType" AS ENUM ('ONE_TIME', 'RECURRING');

-- AlterTable
ALTER TABLE "Campaign"
ADD COLUMN "scheduleType" "CampaignScheduleType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN "recurrenceDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "recurrenceStartDate" TEXT,
ADD COLUMN "recurrenceEndDate" TEXT,
ADD COLUMN "dailyStartTime" TEXT,
ADD COLUMN "dailyEndTime" TEXT;

-- AlterTable
ALTER TABLE "ScheduleWindow"
ADD COLUMN "occurrenceKey" TEXT NOT NULL DEFAULT 'one-time';

-- Replace old one-window-per-screen campaign constraint
DROP INDEX "ScheduleWindow_campaignId_screenId_key";

CREATE UNIQUE INDEX "ScheduleWindow_campaignId_screenId_occurrenceKey_key"
ON "ScheduleWindow"("campaignId", "screenId", "occurrenceKey");
