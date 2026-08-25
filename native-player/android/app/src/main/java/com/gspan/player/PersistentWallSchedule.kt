package com.gspan.player

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max

/**
 * Persists the screen-specific wall timeline and committed shared release epoch.
 *
 * Media persistence removes WAN from the rendering path. This store removes WAN
 * from the timing/sequence path for a wall run that this device has already seen
 * in ARMED or RUNNING state.
 */
class PersistentWallSchedule(context: Context) {
    data class Position(
        val itemIndex: Int,
        val item: WallControlPlaneClient.TimelineItem,
        val offsetMs: Long,
        val loopDurationMs: Long,
    )

    data class StoredRun(
        val plan: WallControlPlaneClient.PreloadPlan,
        val clockOffsetMs: Long,
        val observedAtEpochMs: Long,
    ) {
        fun canRunOffline(nowEpochMs: Long, cache: PersistentMediaCache): Boolean =
            plan.runStatus in setOf("ARMED", "RUNNING") &&
                plan.releaseEpochMs != null &&
                nowEpochMs >= plan.releaseEpochMs &&
                nowEpochMs < plan.scheduledEndEpochMs &&
                plan.timeline.isNotEmpty() &&
                cache.manifestReady(plan.manifestVersion)
    }

    private val root = File(context.filesDir, "gspan-wall-state").apply { mkdirs() }

    fun persist(
        plan: WallControlPlaneClient.PreloadPlan,
        clockOffsetMs: Long = load(plan.manifestVersion)?.clockOffsetMs ?: 0L,
    ) {
        val json = JSONObject().apply {
            put("wallId", plan.wallId)
            put("wallName", plan.wallName)
            put("campaignId", plan.campaignId)
            put("occurrenceKey", plan.occurrenceKey)
            put("manifestVersion", plan.manifestVersion)
            put("scheduledStartEpochMs", plan.scheduledStartEpochMs)
            put("scheduledEndEpochMs", plan.scheduledEndEpochMs)
            put("releaseAt", plan.releaseAt ?: JSONObject.NULL)
            put("releaseEpochMs", plan.releaseEpochMs ?: JSONObject.NULL)
            put("runStatus", plan.runStatus)
            put("failurePolicy", plan.failurePolicy)
            put("requireAllMembersReady", plan.requireAllMembersReady)
            put("clockOffsetMs", clockOffsetMs)
            put("observedAtEpochMs", System.currentTimeMillis())
            put("assets", JSONArray().apply {
                plan.assets.forEach { asset ->
                    put(JSONObject().apply {
                        put("assetId", asset.assetId)
                        put("type", asset.type)
                        put("primaryUrl", asset.primaryUrl)
                        put("fallbackUrls", JSONArray(asset.fallbackUrls))
                        put("expectedBytes", asset.expectedBytes ?: JSONObject.NULL)
                    })
                }
            })
            put("timeline", JSONArray().apply {
                plan.timeline.forEach { item ->
                    put(JSONObject().apply {
                        put("kind", item.kind)
                        put("durationSeconds", item.durationSeconds)
                        put("assetId", item.assetId ?: JSONObject.NULL)
                        put("type", item.type ?: JSONObject.NULL)
                        put("sourceKind", item.sourceKind ?: JSONObject.NULL)
                        put("sceneMode", item.sceneMode ?: JSONObject.NULL)
                        put("reason", item.reason ?: JSONObject.NULL)
                    })
                }
            })
        }

        atomicWrite(fileFor(plan.manifestVersion), json.toString().toByteArray(Charsets.UTF_8))
        atomicWrite(
            File(root, ACTIVE_POINTER),
            JSONObject().apply {
                put("manifestVersion", plan.manifestVersion)
                put("updatedAtEpochMs", System.currentTimeMillis())
            }.toString().toByteArray(Charsets.UTF_8),
        )
    }

    fun updateClockOffset(manifestVersion: String, clockOffsetMs: Long) {
        val existing = load(manifestVersion) ?: return
        persist(existing.plan, clockOffsetMs)
    }

    fun load(manifestVersion: String): StoredRun? {
        val file = fileFor(manifestVersion)
        if (!file.isFile) return null
        return runCatching { parse(JSONObject(file.readText())) }.getOrNull()
    }

    fun loadActive(): StoredRun? {
        val pointer = File(root, ACTIVE_POINTER)
        if (!pointer.isFile) return null
        val manifestVersion = runCatching {
            JSONObject(pointer.readText()).getString("manifestVersion")
        }.getOrNull() ?: return null
        return load(manifestVersion)
    }

    fun offlinePosition(
        stored: StoredRun,
        localNowEpochMs: Long = System.currentTimeMillis(),
    ): Position? {
        val releaseEpochMs = stored.plan.releaseEpochMs ?: return null
        if (stored.plan.timeline.isEmpty()) return null

        val durations = stored.plan.timeline.map { max(1, it.durationSeconds).toLong() * 1000L }
        val loopDurationMs = durations.sum()
        if (loopDurationMs <= 0L) return null

        val serverNowMs = localNowEpochMs + stored.clockOffsetMs
        if (serverNowMs < releaseEpochMs || serverNowMs >= stored.plan.scheduledEndEpochMs) {
            return null
        }

        var phaseMs = (serverNowMs - releaseEpochMs) % loopDurationMs
        stored.plan.timeline.forEachIndexed { index, item ->
            val durationMs = durations[index]
            if (phaseMs < durationMs) {
                return Position(
                    itemIndex = index,
                    item = item,
                    offsetMs = phaseMs,
                    loopDurationMs = loopDurationMs,
                )
            }
            phaseMs -= durationMs
        }

        return null
    }

    fun purgeExcept(keepManifestVersions: Set<String>) {
        root.listFiles()?.forEach { file ->
            if (!file.isFile || file.name == ACTIVE_POINTER) return@forEach
            val manifest = file.name.removeSuffix(".json")
            if (manifest !in keepManifestVersions) file.delete()
        }

        val active = loadActive()
        if (active != null && active.plan.manifestVersion !in keepManifestVersions) {
            File(root, ACTIVE_POINTER).delete()
        }
    }

    private fun parse(json: JSONObject): StoredRun {
        val assetsArray = json.getJSONArray("assets")
        val assets = buildList {
            for (index in 0 until assetsArray.length()) {
                val item = assetsArray.getJSONObject(index)
                val fallbackArray = item.optJSONArray("fallbackUrls")
                val fallbacks = buildList {
                    if (fallbackArray != null) {
                        for (fallbackIndex in 0 until fallbackArray.length()) {
                            add(fallbackArray.getString(fallbackIndex))
                        }
                    }
                }
                add(
                    PersistentMediaCache.AssetSpec(
                        assetId = item.getString("assetId"),
                        type = item.getString("type"),
                        primaryUrl = item.getString("primaryUrl"),
                        fallbackUrls = fallbacks,
                        expectedBytes = nullableLong(item, "expectedBytes"),
                    ),
                )
            }
        }

        val timelineArray = json.getJSONArray("timeline")
        val timeline = buildList {
            for (index in 0 until timelineArray.length()) {
                val item = timelineArray.getJSONObject(index)
                add(
                    WallControlPlaneClient.TimelineItem(
                        kind = item.getString("kind"),
                        durationSeconds = item.getInt("durationSeconds").coerceAtLeast(1),
                        assetId = nullableString(item, "assetId"),
                        type = nullableString(item, "type"),
                        sourceKind = nullableString(item, "sourceKind"),
                        sceneMode = nullableString(item, "sceneMode"),
                        reason = nullableString(item, "reason"),
                    ),
                )
            }
        }

        val plan = WallControlPlaneClient.PreloadPlan(
            wallId = json.getString("wallId"),
            wallName = json.optString("wallName"),
            campaignId = json.getString("campaignId"),
            occurrenceKey = json.getString("occurrenceKey"),
            manifestVersion = json.getString("manifestVersion"),
            scheduledStartEpochMs = json.getLong("scheduledStartEpochMs"),
            scheduledEndEpochMs = json.getLong("scheduledEndEpochMs"),
            releaseAt = nullableString(json, "releaseAt"),
            releaseEpochMs = nullableLong(json, "releaseEpochMs"),
            runStatus = json.optString("runStatus", "PREPARING"),
            failurePolicy = json.optString("failurePolicy", "HOLD_LAST_READY"),
            requireAllMembersReady = json.optBoolean("requireAllMembersReady", true),
            assets = assets,
            timeline = timeline,
        )

        return StoredRun(
            plan = plan,
            clockOffsetMs = json.optLong("clockOffsetMs", 0L),
            observedAtEpochMs = json.optLong("observedAtEpochMs", 0L),
        )
    }

    private fun fileFor(manifestVersion: String) =
        File(root, "${safeName(manifestVersion)}.json")

    private fun atomicWrite(destination: File, bytes: ByteArray) {
        destination.parentFile?.mkdirs()
        val part = File(destination.parentFile, "${destination.name}.part")
        FileOutputStream(part).use { output ->
            output.write(bytes)
            output.flush()
            output.fd.sync()
        }
        if (destination.exists() && !destination.delete()) {
            error("Unable to replace persisted wall schedule ${destination.name}")
        }
        if (!part.renameTo(destination)) {
            error("Atomic wall schedule write failed for ${destination.name}")
        }
    }

    private fun nullableLong(json: JSONObject, key: String): Long? =
        if (json.has(key) && !json.isNull(key)) json.getLong(key) else null

    private fun nullableString(json: JSONObject, key: String): String? =
        if (json.has(key) && !json.isNull(key)) json.getString(key).takeIf { it.isNotBlank() } else null

    private fun safeName(value: String): String = value.replace(Regex("[^A-Za-z0-9._-]"), "_")

    companion object {
        private const val ACTIVE_POINTER = "active.json"
    }
}
