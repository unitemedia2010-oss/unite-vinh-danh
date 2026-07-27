package vn.unite.vinhdanh.tv.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.view.View
import android.widget.ImageView
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Small dependency-free avatar loader with bounded memory and disk caches. */
class AvatarImageLoader(context: Context) : AutoCloseable {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor: ExecutorService = Executors.newFixedThreadPool(3)
    private val diskDir = File(context.filesDir, "avatar-cache").apply { mkdirs() }
    private val inFlightLock = Any()
    private val inFlight = mutableMapOf<String, MutableList<(Bitmap?) -> Unit>>()
    private val memoryCache = object : LruCache<String, Bitmap>(MEMORY_CACHE_KB) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount / 1024
    }

    fun load(url: String?, imageView: ImageView) {
        imageView.tag = url
        imageView.visibility = View.GONE
        if (url.isNullOrBlank()) return

        requestBitmap(url) { bitmap ->
            mainHandler.post {
                if (bitmap != null) showIfCurrent(imageView, url, bitmap)
                else if (imageView.tag == url) imageView.visibility = View.GONE
            }
        }
    }

    fun prefetch(url: String?, callback: (Boolean) -> Unit) {
        if (url.isNullOrBlank()) {
            callback(true)
            return
        }
        requestBitmap(url) { bitmap -> callback(bitmap != null) }
    }

    private fun requestBitmap(url: String, callback: (Bitmap?) -> Unit) {
        val cacheKey = stableCacheKey(url)
        memoryCache.get(cacheKey)?.let { bitmap ->
            callback(bitmap)
            return
        }

        synchronized(inFlightLock) {
            memoryCache.get(cacheKey)?.let { bitmap ->
                callback(bitmap)
                return
            }
            inFlight[cacheKey]?.let { callbacks ->
                callbacks += callback
                return
            }
            inFlight[cacheKey] = mutableListOf(callback)
        }

        try {
            executor.execute {
                val bitmap = runCatching { resolveBitmap(url, cacheKey) }.getOrNull()
                if (bitmap != null) memoryCache.put(cacheKey, bitmap)
                val callbacks = synchronized(inFlightLock) {
                    inFlight.remove(cacheKey).orEmpty()
                }
                callbacks.forEach { pending -> runCatching { pending(bitmap) } }
            }
        } catch (_: Exception) {
            val callbacks = synchronized(inFlightLock) {
                inFlight.remove(cacheKey).orEmpty()
            }
            callbacks.forEach { pending -> runCatching { pending(null) } }
        }
    }

    private fun resolveBitmap(url: String, cacheKey: String): Bitmap? {
        val target = File(diskDir, sha256(cacheKey) + ".avatar")
        val cachedBitmap = target.takeIf { it.isFile }?.let(::decodeSampled)
        val isFresh = target.isFile &&
            System.currentTimeMillis() - target.lastModified() <= DISK_TTL_MS
        if (isFresh && cachedBitmap != null) return cachedBitmap

        val temporary = File(diskDir, target.name + ".download")
        temporary.delete()
        var connection: HttpURLConnection? = null
        try {
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                instanceFollowRedirects = true
                setRequestProperty("Accept", "image/*")
                setRequestProperty("User-Agent", "VinhDanh-TV/0.1")
            }
            val status = connection.responseCode
            require(status in 200..299) { "Avatar HTTP $status" }
            val declaredLength = connection.contentLength.toLong()
            require(declaredLength <= MAX_AVATAR_BYTES || declaredLength < 0L) {
                "Avatar exceeds cache limit"
            }
            connection.inputStream.use { input ->
                FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= MAX_AVATAR_BYTES) { "Avatar exceeds cache limit" }
                        output.write(buffer, 0, count)
                    }
                }
            }
            val downloadedBitmap = requireNotNull(decodeSampled(temporary)) {
                "Downloaded avatar is not a supported image"
            }
            if (target.exists()) require(target.delete()) { "Could not replace avatar cache" }
            if (!temporary.renameTo(target)) {
                temporary.copyTo(target, overwrite = true)
                temporary.delete()
            }
            target.setLastModified(System.currentTimeMillis())
            trimDiskCache()
            return downloadedBitmap
        } catch (error: Exception) {
            if (cachedBitmap != null) return cachedBitmap
            throw error
        } finally {
            connection?.disconnect()
            temporary.delete()
        }
    }

    private fun decodeSampled(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > MAX_BITMAP_EDGE ||
            bounds.outHeight / sample > MAX_BITMAP_EDGE
        ) {
            sample *= 2
        }
        return BitmapFactory.decodeFile(
            file.absolutePath,
            BitmapFactory.Options().apply { inSampleSize = sample }
        )
    }

    private fun trimDiskCache() {
        val files = diskDir.listFiles { file -> file.isFile && !file.name.endsWith(".download") }
            ?.sortedBy(File::lastModified)
            ?: return
        var total = files.sumOf(File::length)
        for (file in files) {
            if (total <= MAX_DISK_CACHE_BYTES) break
            val length = file.length()
            if (file.delete()) total -= length
        }
    }

    private fun showIfCurrent(imageView: ImageView, url: String, bitmap: Bitmap) {
        if (imageView.tag != url) return
        imageView.setImageBitmap(bitmap)
        imageView.visibility = View.VISIBLE
    }

    private fun stableCacheKey(rawUrl: String): String = runCatching {
        Uri.parse(rawUrl).buildUpon().clearQuery().fragment(null).build().toString()
    }.getOrDefault(rawUrl)

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    override fun close() {
        executor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        memoryCache.evictAll()
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 15_000
        const val MAX_AVATAR_BYTES = 8L * 1024L * 1024L
        const val MAX_DISK_CACHE_BYTES = 100L * 1024L * 1024L
        const val DISK_TTL_MS = 7L * 24L * 60L * 60L * 1_000L
        const val MAX_BITMAP_EDGE = 512
        const val MEMORY_CACHE_KB = 12 * 1024
    }
}
