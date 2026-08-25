package com.gspan.player

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Dependency-light client for the G-SPAN wall arming and telemetry contract.
 * Blocking calls must run on a background / IO thread.
 */
class WallControlPlaneClient(
    private val baseUrl: String,
    private val deviceId: String,
    private val bearerToken: String,
) {
    data class PreloadPlan(
        val wallId: String,
        val wallName: String,
        val campaignId: String,
        val occurrenceKey: String,
        val manifestVersion: String,
        val releaseAt: String?,
        val runStatus: String,
        val assets: List<PersistentMediaCache.AssetSpec>,
    )

    data class Telemetry(
        val wallId: String,
        val campaignId: String? = null,
        val occurrenceKey: String? = null,
        val manifestVersion: String? = null,
        val sceneMode: String? = null,
        val currentAssetId: String? = null,
        val currentItemIndex: Int? = null,
        val driftMs: Int? = null,
        val clockOffsetMs: Int? = null,
        val correctionMode: String = "NONE",
        val transport: String = "LOCAL_FILE",
        val cacheReady: Boolean = false,
        val cachedAssets: Int = 0,
        val cacheBytesMb: Int = 0,
        val storageFreeMb: Int? = null,
        val sourceFailovers: Int = 0,
        val hardResyncs: Int = 0,
        val playerVersion: String? = null,
        val lastError: String? = null,
    )

    fun fetchPlaylist(): JSONObject = requestJson(
        method = "GET",
        path = "/api/v1/screens/${encodePath(deviceId)}/playlist",
        body = null,
    )

    fun parsePreloadPlan(playlist: JSONObject): PreloadPlan? {
        val preload = playlist.optJSONObject("preload") ?: return null
        val array = preload.optJSONArray("assets") ?: return null
        val assets = buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                val fallbacks = buildList {
                    val fallbackArray = item.optJSONArray("fallbackUrls")
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
                        primaryUrl = item.getString("url"),
                        fallbackUrls = fallbacks,
                        expectedBytes = item.optLong("expectedBytes").takeIf { item.has("expectedBytes") && !item.isNull("expectedBytes") },
                    ),
                )
            }
        }

        return PreloadPlan(
            wallId = preload.getString("wallId"),
            wallName = preload.optString("wallName"),
            campaignId = preload.getString("campaignId"),
            occurrenceKey = preload.getString("occurrenceKey"),
            manifestVersion = preload.getString("manifestVersion"),
            releaseAt = preload.optString("releaseAt").takeIf { it.isNotBlank() },
            runStatus = preload.optString("runStatus", "PREPARING"),
            assets = assets,
        )
    }

    fun prepareAndAcknowledge(
        plan: PreloadPlan,
        cache: PersistentMediaCache,
    ): PersistentMediaCache.ManifestResult {
        reportReadiness(plan, "PRELOADING", null)
        return try {
            val result = cache.prepareManifest(plan.manifestVersion, plan.assets)
            reportReadiness(plan, "READY", null)
            result
        } catch (error: Throwable) {
            runCatching {
                reportReadiness(plan, "FAILED", error.message ?: "Persistent cache preparation failed")
            }
            throw error
        }
    }

    fun reportReadiness(plan: PreloadPlan, status: String, error: String?) {
        require(status in setOf("PRELOADING", "READY", "FAILED"))
        requestJson(
            method = "POST",
            path = "/api/v1/screens/${encodePath(deviceId)}/wall-readiness",
            body = JSONObject().apply {
                put("wallId", plan.wallId)
                put("campaignId", plan.campaignId)
                put("occurrenceKey", plan.occurrenceKey)
                put("manifestVersion", plan.manifestVersion)
                put("status", status)
                put("error", error ?: JSONObject.NULL)
            },
        )
    }

    fun reportTelemetry(snapshot: Telemetry) {
        requestJson(
            method = "POST",
            path = "/api/v1/screens/${encodePath(deviceId)}/wall-telemetry",
            body = JSONObject().apply {
                put("wallId", snapshot.wallId)
                put("campaignId", snapshot.campaignId ?: JSONObject.NULL)
                put("occurrenceKey", snapshot.occurrenceKey ?: JSONObject.NULL)
                put("manifestVersion", snapshot.manifestVersion ?: JSONObject.NULL)
                put("sceneMode", snapshot.sceneMode ?: JSONObject.NULL)
                put("currentAssetId", snapshot.currentAssetId ?: JSONObject.NULL)
                put("currentItemIndex", snapshot.currentItemIndex ?: JSONObject.NULL)
                put("driftMs", snapshot.driftMs ?: JSONObject.NULL)
                put("clockOffsetMs", snapshot.clockOffsetMs ?: JSONObject.NULL)
                put("correctionMode", snapshot.correctionMode)
                put("transport", snapshot.transport)
                put("cacheReady", snapshot.cacheReady)
                put("cachedAssets", snapshot.cachedAssets)
                put("cacheBytesMb", snapshot.cacheBytesMb)
                put("storageFreeMb", snapshot.storageFreeMb ?: JSONObject.NULL)
                put("sourceFailovers", snapshot.sourceFailovers)
                put("hardResyncs", snapshot.hardResyncs)
                put("playerVersion", snapshot.playerVersion ?: JSONObject.NULL)
                put("lastError", snapshot.lastError ?: JSONObject.NULL)
            },
        )
    }

    private fun requestJson(method: String, path: String, body: JSONObject?): JSONObject {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            setRequestProperty("Authorization", "Bearer $bearerToken")
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }

        try {
            if (body != null) {
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
                    writer.write(body.toString())
                }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                throw IllegalStateException("G-SPAN API HTTP $status: $text")
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }

    private fun encodePath(value: String): String =
        java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
}
