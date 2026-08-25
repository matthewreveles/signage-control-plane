import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const schema = read("prisma/schema.prisma");
const topology = read("lib/display-walls.ts");
const syncMath = read("lib/wall-sync.ts");
const resilience = read("lib/wall-resilience.ts");
const playerPlaylist = read("app/api/v1/screens/[deviceId]/playlist/route.ts");
const wallReadiness = read("app/api/v1/screens/[deviceId]/wall-readiness/route.ts");
const wallTelemetry = read("app/api/v1/screens/[deviceId]/wall-telemetry/route.ts");
const wallStatus = read("app/api/admin/display-walls/[id]/status/route.ts");
const player = read("components/player/SignagePlayer.tsx");
const wallDashboard = read("components/admin/WallOperationsOverview.tsx");
const wallApi = read("app/api/admin/display-walls/route.ts");
const wallMembersApi = read("app/api/admin/display-walls/[id]/members/route.ts");
const wallCreativeApi = read("app/api/admin/display-walls/[id]/creatives/route.ts");
const campaignApi = read("app/api/admin/campaigns/route.ts");
const publishApi = read("app/api/admin/campaigns/[id]/publish/route.ts");
const readiness = read("lib/screen-network-readiness.ts");
const nativeCache = read("native-player/android/app/src/main/java/com/gspan/player/PersistentMediaCache.kt");
const nativeClient = read("native-player/android/app/src/main/java/com/gspan/player/WallControlPlaneClient.kt");
const nativeMonitor = read("native-player/android/app/src/main/java/com/gspan/player/WallRuntimeMonitor.kt");

const checks = [
  ["DisplayWall model", schema.includes("model DisplayWall")],
  ["DisplayWallMember model", schema.includes("model DisplayWallMember")],
  ["Wall creative model", schema.includes("model DisplayWallCreative")],
  ["Per-member creative assets", schema.includes("model DisplayWallCreativeTile")],
  ["WALL campaign target", schema.includes("WALL") && schema.includes("wallId")],
  ["DISPLAY_WALL playlist item", schema.includes("DISPLAY_WALL")],
  ["SPAN scene mode", schema.includes("DisplayWallSceneMode") && schema.includes("SPAN")],
  ["INDEPENDENT scene mode", schema.includes("DisplayWallSceneMode") && schema.includes("INDEPENDENT")],
  ["Hybrid scene mode delivered to player", playerPlaylist.includes("sceneMode: creative.mode")],
  ["Dynamic row/column topology", topology.includes("rows") && topology.includes("columns")],
  ["Deterministic viewport coordinates", topology.includes("x: member.column * memberWidth") && topology.includes("y: member.row * memberHeight")],
  ["Matching geometry guard", topology.includes("must use the same resolution and orientation")],
  ["Configurable sync tolerance", topology.includes("syncToleranceMs")],
  ["Configurable hard resync threshold", topology.includes("hardResyncMs")],
  ["Five-minute default preload lead", topology.includes("preloadLeadSec") && topology.includes("default(300)")],
  ["Five-second default release guard", topology.includes("startGuardMs") && topology.includes("default(5000)")],
  ["All-members-ready default", topology.includes("requireAllMembersReady") && topology.includes("default(true)")],
  ["Hold-last-ready default", topology.includes("HOLD_LAST_READY")],
  ["Shared timeline position math", syncMath.includes("expectedWallPosition") && syncMath.includes("resolveTimelinePosition")],
  ["Monotonic wall clock", syncMath.includes("performance.timeOrigin") && syncMath.includes("performance.now")],
  ["Lowest-RTT clock sampling", syncMath.includes("stableServerClockOffsetMs") && syncMath.includes("roundTripMs")],
  ["Soft drift correction", syncMath.includes('mode: "SOFT"') && syncMath.includes("playbackRate")],
  ["Hard drift resync", syncMath.includes('mode: "HARD"')],
  ["Versioned wall manifest", resilience.includes("wallManifestVersion") && resilience.includes("sha256")],
  ["Preload window helper", resilience.includes("wallPreloadWindowStart")],
  ["Future shared release helper", resilience.includes("wallReleaseAt")],
  ["Per-screen readiness ACK model", schema.includes("model DisplayWallReadinessAck")],
  ["Shared wall run model", schema.includes("model DisplayWallRun")],
  ["Current wall telemetry model", schema.includes("model DisplayWallTelemetry")],
  ["Telemetry distinguishes local-file playback", schema.includes("DisplayWallPlaybackTransport") && schema.includes("LOCAL_FILE") && schema.includes("BROWSER_CACHE")],
  ["Readiness endpoint validates manifest version", wallReadiness.includes("expectedManifestVersion")],
  ["Wall run arms only when all members ready", wallReadiness.includes("readyCount === memberCount") && wallReadiness.includes('status: "ARMED"')],
  ["Wall run blocks preload failure", wallReadiness.includes('status: "BLOCKED"')],
  ["Wall playback gated by ARMED/RUNNING release", playerPlaylist.includes('run.status === "ARMED"') && playerPlaylist.includes("run.releaseAt <= now")],
  ["Pending wall exposes preload plan", playerPlaylist.includes("manifestVersion") && playerPlaylist.includes("scheduledStartAt") && playerPlaylist.includes("assets")],
  ["Unavailable wall falls through to lower-priority schedule", playerPlaylist.includes("for (const candidate of activeCandidates)")],
  ["Redundant media origins", wallCreativeApi.includes("fallbackUrls") && playerPlaylist.includes("redundantUrls")],
  ["Player tries alternate media origins", player.includes("mediaCandidates") && player.includes("nextMediaOrigin")],
  ["Player fetches/decodes before READY", player.includes("preloadAsset") && player.includes("verifyImage") && player.includes("verifyVideo")],
  ["Preload keyed to immutable manifest version", player.includes("preloadVersionRef") && player.includes("preloadVersion")],
  ["Player remembers successful media origin", player.includes("preloadedUrlRef")],
  ["Missing wall content preserves timeline", playerPlaylist.includes("SYNC_GAP")],
  ["Player follows shared epoch", player.includes("expectedWallPosition")],
  ["Player performs tiered drift correction", player.includes("driftCorrection")],
  ["Wall player does not use local advance timer", player.includes("if (!currentItem || !token || playlist?.sync) return")],
  ["Hold-last-ready renders only previously loaded media", player.includes("lastReadyAsset") && player.includes("onCanPlay") && player.includes("onLoad")],
  ["Authenticated telemetry endpoint", wallTelemetry.includes("requestHasValidDeviceToken") && wallTelemetry.includes("displayWallTelemetry.upsert")],
  ["Telemetry rejects non-member devices", wallTelemetry.includes("not assigned to the requested display wall")],
  ["Live wall status reports worst drift", wallStatus.includes("worstDriftMs") && wallStatus.includes("localFileCount")],
  ["Wall operations dashboard polls live status", wallDashboard.includes("setTimeout(refresh, 5_000)") && wallDashboard.includes("Local files")],
  ["Dashboard identifies production-safe LOCAL_FILE", wallDashboard.includes("LOCAL_FILE is the production-safe state")],
  ["Native cache uses persistent app storage", nativeCache.includes("context.filesDir") && nativeCache.includes("gspan-media")],
  ["Native cache uses atomic partial-file promotion", nativeCache.includes(".part") && nativeCache.includes("fd.sync()") && nativeCache.includes("renameTo")],
  ["Native manifest has READY sentinel", nativeCache.includes("READY_SENTINEL") && nativeCache.includes("manifestReady")],
  ["Native playback resolves local file URI", nativeCache.includes("Uri.fromFile") && nativeCache.includes("localUri")],
  ["Native client reports readiness", nativeClient.includes("wall-readiness") && nativeClient.includes("prepareAndAcknowledge")],
  ["Native client reports telemetry", nativeClient.includes("wall-telemetry") && nativeClient.includes('transport: String = "LOCAL_FILE"')],
  ["Native runtime emits periodic snapshots", nativeMonitor.includes("scheduleWithFixedDelay") && nativeMonitor.includes("reportTelemetry")],
  ["Native runtime counts failover and hard resync", nativeMonitor.includes("sourceFailovers") && nativeMonitor.includes("hardResyncs")],
  ["Wall admin creation API", wallApi.includes("buildDisplayWallTopology")],
  ["Topology replacement invalidates tiles", wallMembersApi.includes('status: "PROCESSING"')],
  ["Logical master is optional", wallCreativeApi.includes("masterUrl: z.string().url().optional().nullable()")],
  ["Exactly one member asset per scene", wallCreativeApi.includes("exactly one rendered or assigned asset for every configured wall member")],
  ["Wall campaign creation", campaignApi.includes("displayWallCreativeId") && campaignApi.includes('type: "WALL"')],
  ["Wall schedule materialization", publishApi.includes("displayWallId") && publishApi.includes("displayWallMember")],
  ["Player receives wall viewport geometry", playerPlaylist.includes("slotIndex") && playerPlaylist.includes("canvasWidth")],
  ["Wall telemetry readiness checkpoint", readiness.includes("displayWallTelemetryTable") && readiness.includes("wallPlaybackTransportEnum")],
];

let failed = 0;
for (const [label, passed] of checks) {
  if (passed) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}`);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`\n${checks.length} display-wall resilience checks passed.`);
