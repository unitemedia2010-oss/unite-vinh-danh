package vn.unite.vinhdanh.tv.player

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

sealed interface MediaResolution {
    data class Ready(val file: File, val fromCache: Boolean) : MediaResolution
    data class Failure(val message: String, val cause: Throwable? = null) : MediaResolution
}

class MediaFileCache(
    context: Context,
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
) : AutoCloseable {
    private val cacheDir = File(context.filesDir, "media-cache").apply { mkdirs() }

    fun resolve(
        remoteUrl: String,
        expectedSha256: String?,
        callback: (MediaResolution) -> Unit
    ) {
        if (remoteUrl.isBlank()) {
            callback(MediaResolution.Failure("Playlist chưa có media_url"))
            return
        }
        executor.execute {
            try {
                if (remoteUrl.startsWith("file://")) {
                    val local = File(URI(remoteUrl))
                    callback(
                        if (local.isFile) MediaResolution.Ready(local, fromCache = true)
                        else MediaResolution.Failure("Không tìm thấy video cục bộ")
                    )
                    return@execute
                }

                val target = targetFile(remoteUrl, expectedSha256)
                if (target.isFile && target.length() > 0L && checksumMatches(target, expectedSha256)) {
                    target.setLastModified(System.currentTimeMillis())
                    callback(MediaResolution.Ready(target, fromCache = true))
                    return@execute
                }

                val temporary = File(cacheDir, target.name + ".download")
                temporary.delete()
                download(remoteUrl, temporary)
                if (!checksumMatches(temporary, expectedSha256)) {
                    temporary.delete()
                    callback(MediaResolution.Failure("Checksum media không khớp release manifest"))
                    return@execute
                }
                if (target.exists()) target.delete()
                if (!temporary.renameTo(target)) {
                    temporary.copyTo(target, overwrite = true)
                    temporary.delete()
                }
                prune(except = target)
                callback(MediaResolution.Ready(target, fromCache = false))
            } catch (error: Exception) {
                callback(MediaResolution.Failure("Không thể tải media để dùng offline", error))
            }
        }
    }

    private fun download(remoteUrl: String, destination: File) {
        val connection = URL(remoteUrl).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = true
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.setRequestProperty("Accept", "*/*")
            val status = connection.responseCode
            require(status in 200..299) { "HTTP $status" }
            val declaredLength = connection.getHeaderField("Content-Length")?.toLongOrNull()
            require(declaredLength == null || declaredLength <= MAX_SINGLE_FILE_BYTES) {
                "Media vượt giới hạn cache ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB"
            }
            connection.inputStream.use { input ->
                destination.outputStream().buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        require(total <= MAX_SINGLE_FILE_BYTES) { "Media vượt giới hạn cache" }
                        output.write(buffer, 0, read)
                    }
                }
            }
            require(destination.length() > 0L) { "Media tải về rỗng" }
        } finally {
            connection.disconnect()
        }
    }

    private fun targetFile(url: String, expectedSha256: String?): File {
        val extension = runCatching {
            URL(url).path.substringAfterLast('.', "mp4")
                .substringBefore('?')
                .takeIf { it.matches(Regex("[A-Za-z0-9]{2,5}")) }
        }.getOrNull() ?: "mp4"
        val checksumKey = expectedSha256
            ?.trim()
            ?.lowercase()
            ?.takeIf { it.matches(Regex("[a-f0-9]{64}")) }
        val stableUrl = runCatching {
            val parsed = URL(url)
            "${parsed.protocol}://${parsed.host}${parsed.path}"
        }.getOrDefault(url.substringBefore('?').substringBefore('#'))
        val cacheKey = checksumKey ?: sha256(stableUrl.toByteArray(Charsets.UTF_8))
        return File(cacheDir, "$cacheKey.$extension")
    }

    private fun checksumMatches(file: File, expected: String?): Boolean {
        if (expected.isNullOrBlank()) return true
        return file.inputStream().use { input ->
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
            digest.digest().joinToString("") { "%02x".format(it) }
                .equals(expected.trim(), ignoreCase = true)
        }
    }

    private fun prune(except: File) {
        val files = cacheDir.listFiles { file -> file.isFile && !file.name.endsWith(".download") }
            ?.sortedBy(File::lastModified)
            .orEmpty()
        var total = files.sumOf(File::length)
        for (file in files) {
            if (total <= MAX_CACHE_BYTES) break
            if (file == except) continue
            val size = file.length()
            if (file.delete()) total -= size
        }
    }

    override fun close() {
        executor.shutdownNow()
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it) }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 30_000
        const val MAX_SINGLE_FILE_BYTES = 500L * 1024L * 1024L
        const val MAX_CACHE_BYTES = 1024L * 1024L * 1024L
    }
}
