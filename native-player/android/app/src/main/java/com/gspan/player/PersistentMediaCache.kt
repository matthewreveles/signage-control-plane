package com.gspan.player

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Persistent cache used by the production Android / Fire TV player.
 *
 * Contract:
 * 1. Download every asset required by a manifest before acknowledging READY.
 * 2. Write into *.part files, fsync, then atomically rename into place.
 * 3. Playback resolves to a local file URI only after the complete manifest is READY.
 * 4. Network failure after READY cannot interrupt the armed wall run.
 *
 * All blocking methods must run off the Android main thread.
 */
class PersistentMediaCache(context: Context) {
    data class AssetSpec(
        val assetId: String,
        val type: String,
        val primaryUrl: String,
        val fallbackUrls: List<String> = emptyList(),
        val expectedBytes: Long? = null,
    )

    data class CachedAsset(
        val assetId: String,
        val file: File,
        val sourceUrl: String,
        val bytes: Long,
        val failoversUsed: Int,
    ) {
        val uri: Uri get() = Uri.fromFile(file)
    }

    data class ManifestResult(
        val manifestVersion: String,
        val assets: Map<String, CachedAsset>,
        val totalBytes: Long,
        val sourceFailovers: Int,
    )

    private val root = File(context.filesDir, "gspan-media").apply { mkdirs() }

    fun manifestReady(manifestVersion: String): Boolean =
        File(manifestDir(manifestVersion), READY_SENTINEL).isFile

    fun localUri(manifestVersion: String, assetId: String): Uri? {
        if (!manifestReady(manifestVersion)) return null
        val index = readIndex(manifestVersion)
        val entry = index.optJSONObject(assetId) ?: return null
        val fileName = entry.optString("fileName")
        if (fileName.isBlank()) return null
        val file = File(manifestDir(manifestVersion), fileName)
        return file.takeIf { it.isFile && it.length() > 0L }?.let(Uri::fromFile)
    }

    fun cachedBytes(manifestVersion: String): Long {
        val dir = manifestDir(manifestVersion)
        if (!dir.isDirectory) return 0L
        return dir.listFiles()?.filter { it.isFile && !it.name.endsWith(".part") }
            ?.sumOf { it.length() } ?: 0L
    }

    fun prepareManifest(
        manifestVersion: String,
        assets: List<AssetSpec>,
    ): ManifestResult {
        require(manifestVersion.isNotBlank()) { "manifestVersion is required" }
        require(assets.isNotEmpty()) { "A wall manifest must contain at least one asset" }

        val dir = manifestDir(manifestVersion).apply { mkdirs() }
        File(dir, READY_SENTINEL).delete()

        val cached = linkedMapOf<String, CachedAsset>()
        var failovers = 0

        try {
            assets.distinctBy { it.assetId }.forEach { spec ->
                val existing = existingAsset(manifestVersion, spec)
                val resolved = existing ?: downloadAsset(dir, spec)
                cached[spec.assetId] = resolved
                failovers += resolved.failoversUsed
            }

            writeIndex(manifestVersion, cached.values)
            atomicWrite(File(dir, READY_SENTINEL), JSONObject().apply {
                put("manifestVersion", manifestVersion)
                put("assetCount", cached.size)
                put("totalBytes", cached.values.sumOf { it.bytes })
                put("readyAtEpochMs", System.currentTimeMillis())
            }.toString().toByteArray(Charsets.UTF_8))

            return ManifestResult(
                manifestVersion = manifestVersion,
                assets = cached,
                totalBytes = cached.values.sumOf { it.bytes },
                sourceFailovers = failovers,
            )
        } catch (error: Throwable) {
            File(dir, READY_SENTINEL).delete()
            throw error
        }
    }

    fun purgeExcept(keepManifestVersions: Set<String>) {
        root.listFiles()?.filter { it.isDirectory }?.forEach { dir ->
            if (dir.name !in keepManifestVersions) dir.deleteRecursively()
        }
    }

    fun freeBytes(): Long = root.usableSpace

    private fun existingAsset(manifestVersion: String, spec: AssetSpec): CachedAsset? {
        if (!manifestReady(manifestVersion)) return null
        val entry = readIndex(manifestVersion).optJSONObject(spec.assetId) ?: return null
        val fileName = entry.optString("fileName")
        val sourceUrl = entry.optString("sourceUrl")
        val file = File(manifestDir(manifestVersion), fileName)
        if (!file.isFile || file.length() <= 0L) return null
        if (spec.expectedBytes != null && file.length() != spec.expectedBytes) return null
        return CachedAsset(
            assetId = spec.assetId,
            file = file,
            sourceUrl = sourceUrl.ifBlank { spec.primaryUrl },
            bytes = file.length(),
            failoversUsed = 0,
        )
    }

    private fun downloadAsset(dir: File, spec: AssetSpec): CachedAsset {
        val urls = (listOf(spec.primaryUrl) + spec.fallbackUrls)
            .filter { it.isNotBlank() }
            .distinct()
        require(urls.isNotEmpty()) { "No source URL for ${spec.assetId}" }

        var lastError: Throwable? = null
        urls.forEachIndexed { index, candidate ->
            val extension = extensionFor(candidate, spec.type)
            val finalFile = File(dir, "${safeName(spec.assetId)}.$extension")
            val partFile = File(dir, "${finalFile.name}.part")
            partFile.delete()

            try {
                val bytes = download(candidate, partFile)
                if (bytes <= 0L) error("Downloaded zero bytes for ${spec.assetId}")
                if (spec.expectedBytes != null && bytes != spec.expectedBytes) {
                    error("Size mismatch for ${spec.assetId}: expected ${spec.expectedBytes}, received $bytes")
                }

                if (finalFile.exists() && !finalFile.delete()) {
                    error("Unable to replace cached asset ${finalFile.name}")
                }
                if (!partFile.renameTo(finalFile)) {
                    error("Atomic cache promotion failed for ${spec.assetId}")
                }

                return CachedAsset(
                    assetId = spec.assetId,
                    file = finalFile,
                    sourceUrl = candidate,
                    bytes = bytes,
                    failoversUsed = index,
                )
            } catch (error: Throwable) {
                partFile.delete()
                lastError = error
            }
        }

        throw IllegalStateException(
            "All media origins failed for ${spec.assetId}: ${lastError?.message ?: "unknown error"}",
            lastError,
        )
    }

    private fun download(sourceUrl: String, destination: File): Long {
        val connection = (URL(sourceUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            requestMethod = "GET"
            setRequestProperty("Accept", "*/*")
            setRequestProperty("Cache-Control", "no-transform")
        }

        try {
            connection.connect()
            if (connection.responseCode !in 200..299) {
                error("HTTP ${connection.responseCode} from media origin")
            }

            var total = 0L
            BufferedInputStream(connection.inputStream).use { input ->
                FileOutputStream(destination).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        total += count
                    }
                    output.flush()
                    output.fd.sync()
                }
            }
            return total
        } finally {
            connection.disconnect()
        }
    }

    private fun writeIndex(manifestVersion: String, assets: Collection<CachedAsset>) {
        val objectMap = JSONObject()
        assets.forEach { asset ->
            objectMap.put(asset.assetId, JSONObject().apply {
                put("fileName", asset.file.name)
                put("sourceUrl", asset.sourceUrl)
                put("bytes", asset.bytes)
                put("sha256", sha256(asset.file))
            })
        }
        atomicWrite(File(manifestDir(manifestVersion), INDEX_FILE), objectMap.toString().toByteArray(Charsets.UTF_8))
    }

    private fun readIndex(manifestVersion: String): JSONObject {
        val file = File(manifestDir(manifestVersion), INDEX_FILE)
        if (!file.isFile) return JSONObject()
        return runCatching { JSONObject(file.readText()) }.getOrElse { JSONObject() }
    }

    private fun atomicWrite(destination: File, bytes: ByteArray) {
        destination.parentFile?.mkdirs()
        val part = File(destination.parentFile, "${destination.name}.part")
        FileOutputStream(part).use { output ->
            output.write(bytes)
            output.flush()
            output.fd.sync()
        }
        if (destination.exists() && !destination.delete()) {
            error("Unable to replace ${destination.name}")
        }
        if (!part.renameTo(destination)) error("Atomic write failed for ${destination.name}")
    }

    private fun manifestDir(manifestVersion: String) = File(root, safeName(manifestVersion))

    private fun extensionFor(url: String, type: String): String {
        val path = runCatching { URL(url).path }.getOrDefault("")
        val extension = path.substringAfterLast('.', "").lowercase()
        if (extension.matches(Regex("[a-z0-9]{2,5}"))) return extension
        return if (type.equals("VIDEO", ignoreCase = true)) "mp4" else "img"
    }

    private fun safeName(value: String): String = value.replace(Regex("[^A-Za-z0-9._-]"), "_")

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val READY_SENTINEL = "READY.json"
        private const val INDEX_FILE = "index.json"
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 45_000
    }
}
