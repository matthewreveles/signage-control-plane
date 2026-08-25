# G-SPAN Android / Fire TV persistent player integration

These Kotlin helpers implement the production playback boundary for synchronized display-wall campaigns.

They are intended to be copied into the existing local player project at:

```text
~/AndroidStudioProjects/GSPANPlayer/app/src/main/java/com/gspan/player/
```

The control plane remains in `signage-control-plane`; the native player owns persistent media, the last committed wall timeline and actual local-file playback.

## Production invariant

A wall run is not considered latency-insulated merely because a device downloaded media once or a browser reports a cache hit.

For G-SPAN production wall playback:

1. The player receives the upcoming `preload` manifest from `/api/v1/screens/:deviceId/playlist`.
2. That manifest contains the exact screen-specific timeline, scheduled start/end epochs and, once armed, the shared `releaseEpochMs`.
3. `PersistentWallSchedule.persist()` stores that control data atomically in app-private storage on every meaningful preload update.
4. `PersistentMediaCache.prepareManifest()` downloads every required asset into app-private persistent storage.
5. Downloads are written as `.part` files, flushed and `fsync()`'d, then atomically renamed into place.
6. The media manifest gets a `READY.json` sentinel only after every required asset succeeds.
7. The player POSTs `READY` to `/wall-readiness` only after the sentinel exists.
8. The control plane waits for the cluster readiness barrier and supplies a shared future release epoch.
9. Subsequent preload polling persists the `ARMED`/`RUNNING` state and `releaseEpochMs` locally.
10. When the run starts, playback resolves `assetId` through `PersistentMediaCache.localUri()` and timeline position through `PersistentWallSchedule.offlinePosition()`.
11. An armed wall must not silently fall back to a network URL for a missing local asset. Apply the configured wall failure policy instead (`HOLD_LAST_READY` by default).
12. The native player reports `transport = LOCAL_FILE` only while the active media URI is actually local.

Once the timeline and media are both persisted, WAN/CDN latency is outside the active playback and sequence path for that already-armed run.

## Files

### `PersistentMediaCache.kt`

- persistent app-private storage under `filesDir/gspan-media`;
- one directory per immutable manifest version;
- primary + alternate origin downloads;
- atomic `.part` promotion;
- file-size validation when `expectedBytes` is present;
- SHA-256 recorded in the local index;
- READY sentinel;
- local `Uri` resolution;
- purge helper for old manifests.

### `PersistentWallSchedule.kt`

- stores wall/campaign/occurrence/manifest identity;
- stores scheduled start/end and shared release epochs;
- stores the exact screen-specific sequence and durations;
- stores SPAN/INDEPENDENT scene identity for each asset item;
- stores last known server clock offset;
- atomic `.part` + `fsync()` persistence;
- keeps an active-run pointer;
- calculates the correct current item and in-item offset from the shared epoch after process restart or API loss;
- refuses offline execution unless the stored run was observed as `ARMED` or `RUNNING`, the release epoch exists, the run has not expired and the matching media manifest is READY.

### `WallControlPlaneClient.kt`

- authenticated playlist fetch;
- parses the preload plan and persistent timeline;
- PRELOADING / READY / FAILED acknowledgements;
- prepares the complete manifest before READY;
- posts wall telemetry snapshots.

### `WallRuntimeMonitor.kt`

- tracks current scene, item and asset;
- tracks drift / clock offset / correction mode;
- counts source failovers and hard resyncs;
- reports cache/storage state;
- emits one current-state telemetry snapshot every five seconds.

## MainActivity integration shape

Do not move all logic into `MainActivity`. Keep MainActivity responsible for lifecycle and presentation, while these helpers own durable cache, timeline and telemetry state.

Representative wiring:

```kotlin
private lateinit var wallCache: PersistentMediaCache
private lateinit var wallSchedule: PersistentWallSchedule
private lateinit var wallClient: WallControlPlaneClient
private lateinit var wallMonitor: WallRuntimeMonitor
private val wallIo = Executors.newSingleThreadExecutor()

private fun initializeWallRuntime(deviceId: String, token: String) {
    wallCache = PersistentMediaCache(applicationContext)
    wallSchedule = PersistentWallSchedule(applicationContext)
    wallClient = WallControlPlaneClient(
        baseUrl = "https://<screen-network-host>",
        deviceId = deviceId,
        bearerToken = token,
    )
    wallMonitor = WallRuntimeMonitor(
        client = wallClient,
        cache = wallCache,
        playerVersion = PLAYER_VERSION,
    )
    wallMonitor.startReporting()
}
```

During the normal playlist poll:

```kotlin
wallIo.execute {
    val playlist = wallClient.fetchPlaylist()
    val preload = wallClient.parsePreloadPlan(playlist)

    if (preload != null) {
        // Persist every state transition, including releaseEpochMs once the run arms.
        wallSchedule.persist(preload)

        if (!wallCache.manifestReady(preload.manifestVersion)) {
            val result = wallClient.prepareAndAcknowledge(preload, wallCache)
            wallMonitor.onManifestPrepared(preload, result)
        }
    }

    // Existing playlist/render scheduling continues here.
}
```

Whenever a better server-clock estimate is calculated:

```kotlin
wallMonitor.onClockSample(clockOffsetMs)
wallSchedule.updateClockOffset(manifestVersion, clockOffsetMs.toLong())
```

When an armed wall asset is selected:

```kotlin
val localUri = wallCache.localUri(manifestVersion, assetId)

if (localUri != null) {
    // Give this URI to the native video/image renderer.
    // Do not substitute the network URL while an armed wall run is active.
} else {
    // HOLD_LAST_READY: keep the last proven frame/asset.
    // FALLBACK_STANDARD: leave the wall run and resume the lower-priority normal schedule.
}
```

On scene changes:

```kotlin
wallMonitor.onScene(
    sceneMode = item.sceneMode,       // SPAN or INDEPENDENT
    assetId = item.assetId,
    itemIndex = activeIndex,
)
```

During the existing shared-clock correction loop:

```kotlin
wallMonitor.onDrift(driftMs, correctionMode)

if (correctionMode == "HARD") {
    wallMonitor.onHardResync(driftMs)
}
```

## Offline / restart continuation

At startup or after an API failure:

```kotlin
val stored = wallSchedule.loadActive()

if (stored != null && stored.canRunOffline(System.currentTimeMillis(), wallCache)) {
    val position = wallSchedule.offlinePosition(stored)

    if (position != null) {
        val item = position.item

        if (item.kind == "ASSET" && item.assetId != null) {
            val localUri = wallCache.localUri(stored.plan.manifestVersion, item.assetId)
            // Render localUri and seek video to position.offsetMs when applicable.
        }
    }
}
```

This path is intentionally fail-closed. A PREPARING/BLOCKED run, an unknown release epoch, an expired schedule or an incomplete cache does not get guessed into playback.

For a running/armed persisted wall, the sequence calculation is:

```text
serverNow ≈ localSystemTime + lastKnownClockOffset
elapsed = serverNow - releaseEpoch
phase = elapsed mod timelineDuration
```

The player therefore rejoins the same shared phase instead of restarting item 1.

## Cache retention

Keep at least:

- the currently armed/running manifest and timeline;
- the next successfully prepared manifest and timeline.

After the next manifest is READY, older versions can be removed with `purgeExcept()` on both persistence helpers.

Do not delete the active manifest or timeline during a wall run, even if the control plane becomes unreachable.

## Browser reference vs. native production

The existing browser player now reports `BROWSER_CACHE` telemetry and actual drift/correction/failover information to the same wall operations dashboard. This makes it useful for POC testing and for comparing players.

Only the native player should report `LOCAL_FILE`, and only when it is actually rendering from persistent app-private storage.

That distinction is deliberate:

```text
NETWORK       = media depends on live WAN/CDN delivery
BROWSER_CACHE = browser has preloaded/decoded media, but browser owns cache persistence
LOCAL_FILE    = G-SPAN owns a verified persistent file and active playback uses that file
```

The Display Walls operations view treats `LOCAL_FILE` as the production-safe latency-isolated state.

## Availability boundary

No distributed system can truthfully guarantee that hardware, power, LAN and storage can never fail. G-SPAN's safety rule is therefore stronger and more useful than claiming zero failures: **a device never advances an uncertain wall state.**

Once a run is locally persisted as ARMED/RUNNING, WAN/CDN loss does not remove its media or timeline. Before that point, failures keep the wall in the previous safe state rather than allowing a partially prepared cluster to launch.
