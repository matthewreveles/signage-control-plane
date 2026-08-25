# G-SPAN Android / Fire TV persistent player integration

These Kotlin helpers implement the production playback boundary for synchronized display-wall campaigns.

They are intended to be copied into the existing local player project at:

```text
~/AndroidStudioProjects/GSPANPlayer/app/src/main/java/com/gspan/player/
```

The control plane remains in `signage-control-plane`; the native player owns persistent media storage and actual local-file playback.

## Production invariant

A wall run is not considered latency-insulated merely because the device downloaded the media once or the WebView/browser reports a cache hit.

For G-SPAN production wall playback:

1. The player receives the upcoming `preload` manifest from `/api/v1/screens/:deviceId/playlist`.
2. `PersistentMediaCache.prepareManifest()` downloads every required asset into app-private persistent storage.
3. Downloads are written as `.part` files, flushed and `fsync()`'d, then atomically renamed into place.
4. The manifest gets a `READY.json` sentinel only after every required asset succeeds.
5. The player POSTs `READY` to `/wall-readiness` only after the sentinel exists.
6. The control plane waits for the cluster readiness barrier and supplies a shared `releaseAt`.
7. When the wall run starts, playback resolves `assetId` through `PersistentMediaCache.localUri()`.
8. An armed wall must not fall back to the network URL for a missing local asset. Apply the configured wall failure policy instead (`HOLD_LAST_READY` by default).
9. The native player reports `transport = LOCAL_FILE` only while the active media URI is actually local.

Once step 7 is true, WAN/CDN latency is outside the active playback path.

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

### `WallControlPlaneClient.kt`

- authenticated playlist fetch;
- parses the preload plan;
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

Do not move all logic into `MainActivity`. Keep MainActivity responsible for lifecycle and presentation, while these helpers own durable cache and telemetry state.

Representative wiring:

```kotlin
private lateinit var wallCache: PersistentMediaCache
private lateinit var wallClient: WallControlPlaneClient
private lateinit var wallMonitor: WallRuntimeMonitor
private val wallIo = Executors.newSingleThreadExecutor()

private fun initializeWallRuntime(deviceId: String, token: String) {
    wallCache = PersistentMediaCache(applicationContext)
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

    if (preload != null && !wallCache.manifestReady(preload.manifestVersion)) {
        val result = wallClient.prepareAndAcknowledge(preload, wallCache)
        wallMonitor.onManifestPrepared(preload, result)
    }

    // Existing playlist/render scheduling continues here.
}
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
wallMonitor.onClockSample(clockOffsetMs)
wallMonitor.onDrift(driftMs, correctionMode)

if (correctionMode == "HARD") {
    wallMonitor.onHardResync(driftMs)
}
```

On teardown:

```kotlin
override fun onDestroy() {
    wallMonitor.close()
    wallIo.shutdownNow()
    super.onDestroy()
}
```

## Cache retention

Keep at least:

- the currently armed/running manifest;
- the next successfully prepared manifest.

After the next manifest is READY, older versions can be removed with `purgeExcept()`.

Do not delete the active manifest during a wall run, even if the control plane becomes unreachable.

## Reboot / outage behavior

App-private `filesDir` content survives process death and device reboot. It does not survive app uninstall/data clearing.

At app launch:

1. inspect the most recent stored manifest(s);
2. reconnect to the control plane when possible;
3. if the control plane is unreachable but a still-valid armed schedule has been persisted locally, continue its known timeline using local media;
4. queue proof-of-play / telemetry for later delivery rather than interrupting playback.

Persisting the schedule/epoch itself is the next native hardening step after the media-cache integration. The current control plane already uses an absolute shared epoch, so the native player does not need a different campaign model to support that offline continuation.
