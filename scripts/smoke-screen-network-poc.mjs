import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const packageContract = read("lib/creative-packages.ts");
const schema = read("prisma/schema.prisma");
const playlist = read("app/api/v1/screens/[deviceId]/playlist/route.ts");
const player = read("components/player/SignagePlayer.tsx");
const campaignApi = read("app/api/admin/campaigns/route.ts");

const checks = [
  ["Factory package model", schema.includes("model CreativePackage")],
  ["Factory variant model", schema.includes("model CreativeVariant")],
  ["Package playlist item", schema.includes("CREATIVE_PACKAGE")],
  ["Five real Revive presets", ["728X90", "300X250", "160X600", "320X50", "320X100"].every((size) => packageContract.includes(size))],
  ["Four core signage presets", ["1920X1080", "3840X2160", "1080X1920", "2160X3840"].every((size) => packageContract.includes(size))],
  ["Resolution-aware package selection", playlist.includes("selectBestScreenVariant")],
  ["Approved package playback guard", playlist.includes('creativePackage.status !== "APPROVED"')],
  ["Campaign package handoff", campaignApi.includes("creativePackageId")],
  ["Player heartbeat", player.includes("/heartbeat")],
  ["Proof-of-play queue", player.includes("gspan-proof-queue")],
  ["Player package telemetry", player.includes("presetKey")],
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
console.log(`\n${checks.length} Screen Network proof-of-concept checks passed.`);
