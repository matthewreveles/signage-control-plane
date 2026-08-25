import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const schema = read("prisma/schema.prisma");
const topology = read("lib/display-walls.ts");
const syncMath = read("lib/wall-sync.ts");
const playerPlaylist = read("app/api/v1/screens/[deviceId]/playlist/route.ts");
const player = read("components/player/SignagePlayer.tsx");
const wallApi = read("app/api/admin/display-walls/route.ts");
const wallMembersApi = read("app/api/admin/display-walls/[id]/members/route.ts");
const wallCreativeApi = read("app/api/admin/display-walls/[id]/creatives/route.ts");
const campaignApi = read("app/api/admin/campaigns/route.ts");
const publishApi = read("app/api/admin/campaigns/[id]/publish/route.ts");
const readiness = read("lib/screen-network-readiness.ts");

const checks = [
  ["DisplayWall model", schema.includes("model DisplayWall")],
  ["DisplayWallMember model", schema.includes("model DisplayWallMember")],
  ["Wall creative master model", schema.includes("model DisplayWallCreative")],
  ["Per-member creative tiles", schema.includes("model DisplayWallCreativeTile")],
  ["WALL campaign target", schema.includes("WALL") && schema.includes("wallId")],
  ["DISPLAY_WALL playlist item", schema.includes("DISPLAY_WALL")],
  ["Dynamic row/column topology", topology.includes("rows") && topology.includes("columns")],
  ["Deterministic viewport coordinates", topology.includes("x: member.column * memberWidth") && topology.includes("y: member.row * memberHeight")],
  ["Matching geometry guard", topology.includes("must use the same resolution and orientation")],
  ["Shared timeline position math", syncMath.includes("expectedWallPosition") && syncMath.includes("resolveTimelinePosition")],
  ["Server clock offset estimate", syncMath.includes("estimateServerClockOffsetMs")],
  ["Wall admin creation API", wallApi.includes("buildDisplayWallTopology")],
  ["Topology replacement invalidates tiles", wallMembersApi.includes('status: "PROCESSING"')],
  ["Exact wall-master dimension guard", wallCreativeApi.includes("Master canvas must be exactly")],
  ["Exactly one tile per wall member", wallCreativeApi.includes("exactly one tile for every configured wall member")],
  ["Wall campaign creation", campaignApi.includes("displayWallCreativeId") && campaignApi.includes('type: "WALL"')],
  ["Wall schedule materialization", publishApi.includes("displayWallId") && publishApi.includes("displayWallMember")],
  ["Player receives wall viewport geometry", playerPlaylist.includes("slotIndex") && playerPlaylist.includes("canvasWidth")],
  ["Missing wall content preserves timeline", playerPlaylist.includes("SYNC_GAP")],
  ["Player follows shared epoch", player.includes("expectedWallPosition")],
  ["Player corrects video drift", player.includes("driftMs > sync.toleranceMs")],
  ["Wall player does not use local advance timer", player.includes("if (!currentItem || !token || playlist?.sync) return")],
  ["Wall readiness checkpoint", readiness.includes('displayWallTable') && readiness.includes('displayWallPlaylistValue')],
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
console.log(`\n${checks.length} display-wall architecture checks passed.`);
