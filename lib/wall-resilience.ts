import { createHash } from "node:crypto";

export function wallManifestVersion({
  wallId,
  wallUpdatedAt,
  campaignId,
  campaignUpdatedAt,
  playlistId,
  playlistUpdatedAt,
  occurrenceKey,
}: {
  wallId: string;
  wallUpdatedAt: Date;
  campaignId: string;
  campaignUpdatedAt: Date;
  playlistId: string;
  playlistUpdatedAt: Date;
  occurrenceKey: string;
}) {
  return createHash("sha256")
    .update(
      [
        wallId,
        wallUpdatedAt.toISOString(),
        campaignId,
        campaignUpdatedAt.toISOString(),
        playlistId,
        playlistUpdatedAt.toISOString(),
        occurrenceKey,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

export function wallReleaseAt({
  now,
  scheduledStartAt,
  startGuardMs,
}: {
  now: Date;
  scheduledStartAt: Date;
  startGuardMs: number;
}) {
  const guarded = new Date(now.getTime() + Math.max(1000, startGuardMs));
  return scheduledStartAt > guarded ? scheduledStartAt : guarded;
}

export function wallPreloadWindowStart({
  scheduledStartAt,
  preloadLeadSec,
}: {
  scheduledStartAt: Date;
  preloadLeadSec: number;
}) {
  return new Date(
    scheduledStartAt.getTime() - Math.max(30, preloadLeadSec) * 1000,
  );
}
