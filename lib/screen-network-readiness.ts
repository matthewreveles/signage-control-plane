import { prisma } from "@/lib/prisma";

export const SCREEN_NETWORK_MIGRATION =
  "20260825133000_wall_resilience_hybrid" as const;

type ReadinessRow = {
  creativePackageTable: boolean;
  creativeVariantTable: boolean;
  displayWallTable: boolean;
  displayWallMemberTable: boolean;
  displayWallCreativeTable: boolean;
  displayWallCreativeTileTable: boolean;
  displayWallReadinessTable: boolean;
  displayWallRunTable: boolean;
  deviceTokenHashColumn: boolean;
  creativePackageIdColumn: boolean;
  displayWallCreativeIdColumn: boolean;
  campaignTargetWallIdColumn: boolean;
  scheduleDisplayWallIdColumn: boolean;
  playbackIdColumn: boolean;
  wallHardResyncColumn: boolean;
  wallPreloadLeadColumn: boolean;
  wallStartGuardColumn: boolean;
  wallFailurePolicyColumn: boolean;
  wallCreativeModeColumn: boolean;
  creativePackageEnum: boolean;
  creativeDestinationEnum: boolean;
  wallSceneModeEnum: boolean;
  wallReadinessStatusEnum: boolean;
  wallRunStatusEnum: boolean;
  creativePackagePlaylistValue: boolean;
  displayWallPlaylistValue: boolean;
  displayWallCampaignTargetValue: boolean;
};

export type ScreenNetworkReadiness = {
  ready: boolean;
  status: "ready" | "migration_required" | "database_unavailable";
  migration: typeof SCREEN_NETWORK_MIGRATION;
  checks: ReadinessRow | null;
};

export async function getScreenNetworkReadiness(): Promise<ScreenNetworkReadiness> {
  try {
    const [checks] = await prisma.$queryRaw<ReadinessRow[]>`
      SELECT
        to_regclass('public."CreativePackage"') IS NOT NULL AS "creativePackageTable",
        to_regclass('public."CreativeVariant"') IS NOT NULL AS "creativeVariantTable",
        to_regclass('public."DisplayWall"') IS NOT NULL AS "displayWallTable",
        to_regclass('public."DisplayWallMember"') IS NOT NULL AS "displayWallMemberTable",
        to_regclass('public."DisplayWallCreative"') IS NOT NULL AS "displayWallCreativeTable",
        to_regclass('public."DisplayWallCreativeTile"') IS NOT NULL AS "displayWallCreativeTileTable",
        to_regclass('public."DisplayWallReadinessAck"') IS NOT NULL AS "displayWallReadinessTable",
        to_regclass('public."DisplayWallRun"') IS NOT NULL AS "displayWallRunTable",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Screen' AND column_name = 'deviceTokenHash'
        ) AS "deviceTokenHashColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PlaylistItem' AND column_name = 'creativePackageId'
        ) AS "creativePackageIdColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PlaylistItem' AND column_name = 'displayWallCreativeId'
        ) AS "displayWallCreativeIdColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'CampaignTarget' AND column_name = 'wallId'
        ) AS "campaignTargetWallIdColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ScheduleWindow' AND column_name = 'displayWallId'
        ) AS "scheduleDisplayWallIdColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ProofOfPlayLog' AND column_name = 'playbackId'
        ) AS "playbackIdColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'DisplayWall' AND column_name = 'hardResyncMs'
        ) AS "wallHardResyncColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'DisplayWall' AND column_name = 'preloadLeadSec'
        ) AS "wallPreloadLeadColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'DisplayWall' AND column_name = 'startGuardMs'
        ) AS "wallStartGuardColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'DisplayWall' AND column_name = 'failurePolicy'
        ) AS "wallFailurePolicyColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'DisplayWallCreative' AND column_name = 'mode'
        ) AS "wallCreativeModeColumn",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'CreativePackageStatus'
        ) AS "creativePackageEnum",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'CreativeDestination'
        ) AS "creativeDestinationEnum",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'DisplayWallSceneMode'
        ) AS "wallSceneModeEnum",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'DisplayWallReadinessStatus'
        ) AS "wallReadinessStatusEnum",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'DisplayWallRunStatus'
        ) AS "wallRunStatusEnum",
        EXISTS (
          SELECT 1
          FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'PlaylistItemKind'
            AND pg_enum.enumlabel = 'CREATIVE_PACKAGE'
        ) AS "creativePackagePlaylistValue",
        EXISTS (
          SELECT 1
          FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'PlaylistItemKind'
            AND pg_enum.enumlabel = 'DISPLAY_WALL'
        ) AS "displayWallPlaylistValue",
        EXISTS (
          SELECT 1
          FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'CampaignTargetType'
            AND pg_enum.enumlabel = 'WALL'
        ) AS "displayWallCampaignTargetValue"
    `;

    const ready = Boolean(checks) && Object.values(checks).every(Boolean);

    return {
      ready,
      status: ready ? "ready" : "migration_required",
      migration: SCREEN_NETWORK_MIGRATION,
      checks: checks ?? null,
    };
  } catch {
    return {
      ready: false,
      status: "database_unavailable",
      migration: SCREEN_NETWORK_MIGRATION,
      checks: null,
    };
  }
}
