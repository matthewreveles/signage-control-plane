# G-SPAN Display Walls and Clusters

Display Walls extend the Screen Network from ordinary group-targeted signage into synchronized spatial playback. A wall is an ordered set of physical screens that can behave either as viewports into one logical composition or as individually addressed displays while remaining on one shared campaign timeline.

## Domain boundaries

`ScreenGroup` remains the ordinary targeting primitive: every member receives the same campaign content independently.

`DisplayWall` is the synchronized cluster primitive. It stores physical topology, logical canvas geometry, resilience policy and shared-clock requirements. The name "wall" describes the synchronized domain; the physical installation can be a horizontal ribbon, grid, column or another ordered cluster.

Keeping these concepts separate prevents ordinary group delivery from inheriting synchronization requirements and lets one physical screen participate in normal campaigns outside a wall schedule.

## Hybrid scene modes

A display-wall playlist can alternate between two `DisplayWallSceneMode` values without changing campaign, target or device pairing.

### `SPAN`

The cluster acts as one logical canvas. Every member receives the tile corresponding to its physical viewport.

Example for a 4-screen ribbon:

```text
Shared logical scene
┌──────────┬──────────┬──────────┬──────────┐
│ viewport │ viewport │ viewport │ viewport │
│    1     │    2     │    3     │    4     │
└──────────┴──────────┴──────────┴──────────┘
```

### `INDEPENDENT`

The same cluster remains synchronized as a unit, but each member receives its own respective asset.

```text
Independent scene
┌──────────┬──────────┬──────────┬──────────┐
│ product A│ product B│ menu     │ brand D  │
└──────────┴──────────┴──────────┴──────────┘
```

A single campaign can therefore run a sequence such as:

```text
SPAN takeover
→ INDEPENDENT product panels
→ SPAN transition
→ INDEPENDENT menus/promotions
→ SPAN brand close
```

The shared clock remains active through both modes. Mode changes are playlist events, not new campaigns.

## Topology

Each wall stores:

- rows and columns;
- logical canvas width and height;
- timezone;
- normal synchronization tolerance;
- hard-resynchronization threshold;
- preload lead time;
- final release guard time;
- all-members-ready requirement;
- failure policy;
- an ordered `DisplayWallMember` for every assigned screen;
- each member's row, column, slot index, x/y origin and viewport width/height.

The initial production topology requires every member to use the same resolution and orientation. This gives the media processor deterministic viewport regions and removes mixed-device geometry as an avoidable source of timing and crop errors.

Examples using 1920×1080 screens:

| Layout | Screens | Logical canvas |
| --- | ---: | ---: |
| 12×1 ribbon | 12 | 23,040×1,080 |
| 25×1 ribbon | 25 | 48,000×1,080 |
| 5×5 wall | 25 | 9,600×5,400 |

The logical canvas is a coordinate space, not a requirement to encode one gigantic media file. `masterUrl`, `masterWidth` and `masterHeight` are optional provenance metadata. This is necessary for installations whose logical dimensions exceed normal authoring or codec limits.

## Media-processing contract

Heavy image/video rendering and transcoding should run in a dedicated media worker, not inside a latency-sensitive Next.js request handler.

For a `SPAN` scene, the worker flow is:

1. Read the destination wall topology from the control plane.
2. Accept or generate the logical scene.
3. Render one tile per `DisplayWallMember` using that member's x/y/width/height viewport.
4. Encode every video tile with identical frame rate, duration, time base and GOP/keyframe structure.
5. Upload the tiles to durable object storage/CDN. A giant encoded master is optional.
6. Optionally supply alternate origins for each tile.
7. POST the completed manifest to `POST /api/admin/display-walls/:id/creatives`.
8. The control plane validates member coverage and asset geometry before making the scene `READY`.

For an `INDEPENDENT` scene, the worker/importer assigns one complete asset to every member rather than cropping one shared composition. Timing requirements remain the same for video assets because the cluster still transitions on one shared timeline.

A representative hybrid-capable 3-screen manifest is:

```json
{
  "name": "GP Mart product trio",
  "mode": "INDEPENDENT",
  "type": "VIDEO",
  "durationSec": 15,
  "sourceJobId": "wall-render-20260825-001",
  "tiles": [
    {
      "memberId": "member-screen-01",
      "url": "https://primary.example/screen-01.mp4",
      "fallbackUrls": [
        "https://backup.example/screen-01.mp4"
      ],
      "width": 1920,
      "height": 1080,
      "codec": "h264"
    },
    {
      "memberId": "member-screen-02",
      "url": "https://primary.example/screen-02.mp4",
      "fallbackUrls": [
        "https://backup.example/screen-02.mp4"
      ],
      "width": 1920,
      "height": 1080,
      "codec": "h264"
    },
    {
      "memberId": "member-screen-03",
      "url": "https://primary.example/screen-03.mp4",
      "fallbackUrls": [
        "https://backup.example/screen-03.mp4"
      ],
      "width": 1920,
      "height": 1080,
      "codec": "h264"
    }
  ]
}
```

A `SPAN` manifest uses the same member-asset contract; the difference is semantic: those assets are viewport tiles of one shared logical scene.

## Scheduling

Campaigns may target `SCREEN`, `GROUP` or `WALL`.

Publishing a wall target materializes one `ScheduleWindow` for every wall member and preserves the originating `displayWallId` on those rows. This gives each device the same campaign occurrence while retaining its viewport identity.

During a wall schedule:

- ordinary assets can still play on every member;
- a `DISPLAY_WALL` `SPAN` scene resolves to the requesting member's viewport tile;
- a `DISPLAY_WALL` `INDEPENDENT` scene resolves to the requesting member's respective full-screen asset;
- an unavailable scene becomes a `SYNC_GAP` rather than disappearing from only one member's playlist;
- every member therefore retains exactly the same timeline duration even when its visual payload differs.

## Latency-resilience model

The wall is designed around a stronger rule than ordinary streaming signage:

> A synchronized takeover should never begin merely because its scheduled clock time arrived. It begins only after the cluster has proved it is prepared.

### 1. Preload window

Each wall has `preloadLeadSec`, defaulting to 300 seconds. During this window every member receives the exact manifest revision and all media required for its own upcoming wall run.

The browser reference player fetches every asset completely and verifies that images decode and videos reach playable data before reporting `READY`.

The production Android/Fire TV player should go further: persist the verified media to local storage and play a local URI. That removes WAN/CDN latency from the actual playback path after arming.

### 2. Versioned readiness acknowledgements

Each campaign occurrence gets a deterministic `manifestVersion`. Every device reports one of:

- `PRELOADING`
- `READY`
- `FAILED`

An acknowledgement for an old manifest revision is rejected. A topology, playlist or campaign change therefore cannot accidentally arm devices using stale media.

### 3. All-ready barrier

The default `requireAllMembersReady = true` means a synchronized wall cannot arm until every required member has reported `READY` for the same manifest revision.

If one member fails, the run becomes `BLOCKED`. The other members do not partially begin the wall scene.

A failed device continues retrying. When it later verifies the media and reports `READY`, the barrier can clear.

### 4. Future release guard

When the last required member becomes ready, the control plane does not answer "play immediately." It assigns one common future `releaseAt`, using `startGuardMs` (default 5,000 ms) as the final synchronization guard.

Every member therefore knows the same future epoch before playback begins.

### 5. Redundant media origins

Each member asset may contain one primary URL and up to three alternate origins. Preload tries the origins in order and remembers the one that successfully fetched and decoded. If the selected origin later errors during browser playback, the reference player can attempt another origin.

For native production players, the preferred hierarchy is:

```text
persistent local file
→ alternate local copy if maintained
→ primary remote origin
→ secondary remote origin
→ failure policy
```

### 6. Failure policy

A blocked wall never partially starts.

`HOLD_LAST_READY` is the conservative default. A device keeps the last media it actually rendered successfully while the synchronized takeover is unavailable.

`FALLBACK_STANDARD` allows the scheduler to continue the lower-priority non-wall campaign/schedule until the wall run becomes eligible.

### 7. No per-device "play now" command

Players synchronize against an absolute timeline rather than the arrival time of a network message. This makes message latency largely irrelevant after a run is armed.

## Shared playback clock

The playlist response supplies:

- `epochMs`: common release epoch;
- `serverNowMs`: time sample used to estimate server-clock offset;
- `toleranceMs`: normal allowed playback drift;
- `hardResyncMs`: severe-drift threshold;
- wall and viewport geometry;
- immutable manifest revision.

The browser player uses a monotonic local clock based on `performance.timeOrigin + performance.now()` where supported.

For network clock estimation, one slow request is not trusted blindly. The player keeps multiple samples, favors the lowest round-trip-time samples and uses their median offset.

The estimated shared position is:

```text
serverNow ≈ monotonicLocalNow + stableClockOffset
elapsed = serverNow - epoch
phase = elapsed mod playlistDuration
```

That phase determines both the current playlist item and the offset inside it. A player that launches or reconnects midway through an animation therefore jumps to the current shared phase instead of restarting from frame zero.

## Tiered video drift correction

Repeated hard seeking can itself look like synchronization failure, so drift correction is tiered.

- Within `syncToleranceMs`: do nothing.
- Between tolerance and `hardResyncMs`: make a subtle temporary playback-rate correction, capped to approximately ±2%.
- At or beyond `hardResyncMs`: hard seek to the expected shared playhead.

The browser reference player checks alignment every 200 ms. The production native player can use a tighter media-clock implementation without changing the control-plane contract.

## Failure scenarios

| Failure | G-SPAN behavior |
| --- | --- |
| One device is slow downloading | Wall remains PREPARING; ordinary/held content continues |
| One device cannot decode an asset | Device reports FAILED; wall becomes BLOCKED |
| Primary CDN/origin fails | Player tries alternate media origin |
| Internet fails after native preload | Native player continues local playback against shared timeline |
| Browser API polling temporarily fails after activation | Last known synchronized timeline continues; polling retries |
| Device launches late | Device resolves current shared phase rather than restarting |
| Moderate clock/media drift | Soft playback-rate correction |
| Severe drift | Hard seek to shared playhead |
| Missing member asset | `SYNC_GAP` preserves common scene duration |
| Topology changes | Existing wall scenes return to PROCESSING until member mappings are regenerated |
| Wall scene belongs to another wall | It cannot resolve into that wall schedule |

## What "latency-proof" means in production

No distributed system can promise that networks, storage or hardware will never fail. G-SPAN's goal is stronger and operationally useful: **network latency should not be part of the critical playback path once a synchronized wall run is armed.**

The control plane already enforces pre-arming, manifest consistency, shared future release and recovery behavior. The final production step is implementing the same contract in the Android/Fire TV player with persistent local media files, checksums and local-URI playback. Once that is in place, WAN latency affects how early a future campaign becomes ready, not whether an already-armed scene starts on time.

## Deployment boundary

The resilience schema is additive but requires an explicit database migration. Vercel builds do not apply migrations automatically.

```bash
npm run db:status
npm run db:deploy
```

The current required migration is:

```text
20260825133000_wall_resilience_hybrid
```

After migration, verify `/api/v1/health` returns HTTP 200 and `ready: true` before testing wall creation, manifest import, pre-arming or synchronized player delivery.

## Verification

```bash
npm run smoke:display-walls
npm run db:status
npm run typecheck
npm run lint
npm run build
```
