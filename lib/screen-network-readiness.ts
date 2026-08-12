import { prisma } from "@/lib/prisma";

export const SCREEN_NETWORK_MIGRATION =
  "20260812000000_screen_network_poc" as const;

type ReadinessRow = {
  creativePackageTable: boolean;
  creativeVariantTable: boolean;
  deviceTokenHashColumn: boolean;
  creativePackageIdColumn: boolean;
  playbackIdColumn: boolean;
  creativePackageEnum: boolean;
  creativeDestinationEnum: boolean;
  playlistItemEnumValue: boolean;
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
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Screen'
            AND column_name = 'deviceTokenHash'
        ) AS "deviceTokenHashColumn",
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'PlaylistItem'
            AND column_name = 'creativePackageId'
        ) AS "creativePackageIdColumn",
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ProofOfPlayLog'
            AND column_name = 'playbackId'
        ) AS "playbackIdColumn",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'CreativePackageStatus'
        ) AS "creativePackageEnum",
        EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'CreativeDestination'
        ) AS "creativeDestinationEnum",
        EXISTS (
          SELECT 1
          FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'PlaylistItemKind'
            AND pg_enum.enumlabel = 'CREATIVE_PACKAGE'
        ) AS "playlistItemEnumValue"
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
