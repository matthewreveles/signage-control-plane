package com.gspan.player

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * Small thread-safe state holder for the native player.
 * MainActivity / the playback engine updates it as scenes change; the monitor
 * emits one telemetry snapshot every few seconds instead of logging every frame.
 */
class WallRuntimeMonitor(
    private val client: WallControlPlaneClient,
    private val cache: PersistentMediaCache,
    private val playerVersion: String,
) {
    private data class RuntimeState(
        val plan: WallControlPlaneClient.PreloadPlan? = null,
        val sceneMode: String? = null,
        val currentAssetId: String? = null,
        val currentItemIndex: Int? = null,
        val driftMs: Int? = null,
        val clockOffsetMs: Int? = null,
        val correctionMode: String = "NONE",
        val cacheReady: Boolean = false,
        val cachedAssets: Int = 0,
        val cacheBytesMb: Int = 0,
        val lastError: String? = null,
    )

    private val state = AtomicReference(RuntimeState())
    private val sourceFailovers = AtomicInteger(0)
    private val hardResyncs = AtomicInteger(0)
    private val executor = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "gspan-wall-telemetry").apply { isDaemon = true }
    }
    private var reportingTask: ScheduledFuture<*>? = null

    fun onManifestPrepared(
        plan: WallControlPlaneClient.PreloadPlan,
        result: PersistentMediaCache.ManifestResult,
    ) {
        sourceFailovers.addAndGet(result.sourceFailovers)
        state.set(
            state.get().copy(
                plan = plan,
                cacheReady = cache.manifestReady(plan.manifestVersion),
                cachedAssets = result.assets.size,
                cacheBytesMb = bytesToMb(result.totalBytes),
                lastError = null,
            ),
        )
    }

    fun onScene(
        sceneMode: String?,
        assetId: String?,
        itemIndex: Int?,
    ) {
        state.set(
            state.get().copy(
                sceneMode = sceneMode,
                currentAssetId = assetId,
                currentItemIndex = itemIndex,
            ),
        )
    }

    fun onClockSample(clockOffsetMs: Int) {
        state.set(state.get().copy(clockOffsetMs = clockOffsetMs))
    }

    fun onDrift(driftMs: Int, correctionMode: String) {
        state.set(
            state.get().copy(
                driftMs = driftMs,
                correctionMode = correctionMode,
            ),
        )
    }

    fun onHardResync(driftMs: Int) {
        hardResyncs.incrementAndGet()
        onDrift(driftMs, "HARD")
    }

    fun onSourceFailover() {
        sourceFailovers.incrementAndGet()
    }

    fun onError(error: Throwable?) {
        state.set(
            state.get().copy(
                lastError = error?.message ?: "Unknown native player error",
            ),
        )
    }

    fun clearError() {
        state.set(state.get().copy(lastError = null))
    }

    fun startReporting(periodSeconds: Long = 5L) {
        if (reportingTask != null) return
        reportingTask = executor.scheduleWithFixedDelay(
            {
                runCatching { reportNow() }
            },
            0L,
            periodSeconds.coerceAtLeast(1L),
            TimeUnit.SECONDS,
        )
    }

    fun stopReporting() {
        reportingTask?.cancel(false)
        reportingTask = null
    }

    fun close() {
        stopReporting()
        executor.shutdownNow()
    }

    fun reportNow() {
        val current = state.get()
        val plan = current.plan ?: return
        val cacheReady = cache.manifestReady(plan.manifestVersion)

        client.reportTelemetry(
            WallControlPlaneClient.Telemetry(
                wallId = plan.wallId,
                campaignId = plan.campaignId,
                occurrenceKey = plan.occurrenceKey,
                manifestVersion = plan.manifestVersion,
                sceneMode = current.sceneMode,
                currentAssetId = current.currentAssetId,
                currentItemIndex = current.currentItemIndex,
                driftMs = current.driftMs,
                clockOffsetMs = current.clockOffsetMs,
                correctionMode = current.correctionMode,
                transport = if (cacheReady) "LOCAL_FILE" else "NETWORK",
                cacheReady = cacheReady,
                cachedAssets = current.cachedAssets,
                cacheBytesMb = current.cacheBytesMb,
                storageFreeMb = bytesToMb(cache.freeBytes()),
                sourceFailovers = sourceFailovers.get(),
                hardResyncs = hardResyncs.get(),
                playerVersion = playerVersion,
                lastError = current.lastError,
            ),
        )
    }

    private fun bytesToMb(bytes: Long): Int =
        (bytes / (1024L * 1024L)).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
}
