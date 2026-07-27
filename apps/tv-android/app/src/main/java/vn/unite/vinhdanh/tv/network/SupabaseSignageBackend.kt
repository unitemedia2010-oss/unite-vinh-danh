package vn.unite.vinhdanh.tv.network

import org.json.JSONArray
import org.json.JSONObject
import vn.unite.vinhdanh.tv.data.DeviceConfig
import vn.unite.vinhdanh.tv.data.ManifestJsonCodec
import vn.unite.vinhdanh.tv.data.PendingPairing
import vn.unite.vinhdanh.tv.data.PlaybackSnapshot
import vn.unite.vinhdanh.tv.data.ReleaseManifest
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Android client for the single Supabase Edge Function contract:
 *   POST /functions/v1/screen-api
 *   action: register | status | manifest | heartbeat
 *
 * The APK contains only the public anon key. Registration returns a short opaque
 * device token; all subsequent calls send it as Authorization: Bearer <deviceToken>.
 * A service_role key must never be shipped in the APK.
 */
class SupabaseSignageBackend(
    supabaseUrl: String,
    private val anonKey: String,
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
) : SignageBackend {
    private val endpoint = supabaseUrl.trim().trimEnd('/') + "/functions/v1/screen-api"

    override val isConfigured: Boolean
        get() = endpoint.startsWith("https://") && anonKey.isNotBlank()

    override fun register(
        request: RegistrationRequest,
        callback: (BackendResult<PendingPairing>) -> Unit
    ) {
        if (!isConfigured) {
            callback(BackendResult.Failure("Supabase chưa được cấu hình trong local.properties"))
            return
        }
        val body = JSONObject()
            .put("action", "register")
            .put("deviceId", request.deviceId)
            .put("deviceName", request.deviceName)
            .put("deviceType", "android_tv")
            .put("appVersion", request.appVersion)

        post(body, null) { response ->
            callback(
                when (response) {
                    is BackendResult.Failure -> response
                    is BackendResult.Success -> try {
                        val json = JSONObject(response.value)
                        BackendResult.Success(
                            PendingPairing(
                                pairingCode = json.getString("pairingCode"),
                                deviceToken = json.getString("deviceToken"),
                                status = json.optString("status", "pending"),
                                expiresAtEpochMs = parseIsoEpochMillis(json.optString("expiresAt"))
                            )
                        )
                    } catch (error: Exception) {
                        BackendResult.Failure("Phản hồi đăng ký thiết bị không hợp lệ", cause = error)
                    }
                }
            )
        }
    }

    override fun checkPairingStatus(
        deviceId: String,
        pending: PendingPairing,
        callback: (BackendResult<PairingStatus>) -> Unit
    ) {
        val body = JSONObject().put("action", "status")
        post(body, pending.deviceToken) { response ->
            callback(
                when (response) {
                    is BackendResult.Failure -> response
                    is BackendResult.Success -> try {
                        val json = JSONObject(response.value)
                        val status = json.optString("status", "pending")
                        val screen = json.objectOrFirst("screen")
                        if (status != "approved" || screen == null) {
                            BackendResult.Success(PairingStatus(status = status))
                        } else {
                            val branch = screen.objectOrFirst("branch")
                            val branchId = screen.optString("branch_id")
                                .ifBlank { branch?.optString("id").orEmpty() }
                            BackendResult.Success(
                                PairingStatus(
                                    status = status,
                                    config = DeviceConfig(
                                        deviceId = deviceId,
                                        deviceToken = pending.deviceToken,
                                        screenId = screen.getString("id"),
                                        branchId = branchId,
                                        branchAddress = branch?.optString("address")
                                            ?.takeIf(String::isNotBlank)
                                            ?: "125 Trần Bình Trọng"
                                    )
                                )
                            )
                        }
                    } catch (error: Exception) {
                        BackendResult.Failure("Phản hồi trạng thái ghép nối không hợp lệ", cause = error)
                    }
                }
            )
        }
    }

    override fun fetchActiveRelease(
        config: DeviceConfig,
        callback: (BackendResult<ReleaseManifest>) -> Unit
    ) {
        if (!isConfigured) {
            callback(BackendResult.Failure("Supabase chưa được cấu hình"))
            return
        }
        post(JSONObject().put("action", "manifest"), config.deviceToken) { response ->
            callback(
                when (response) {
                    is BackendResult.Failure -> response
                    is BackendResult.Success -> try {
                        val envelope = JSONObject(response.value)
                        val releaseJson = envelope.optJSONObject("release")
                            ?: return@post callback(BackendResult.Failure("Màn hình chưa được gán release"))
                        val manifest = releaseJson.optJSONObject("manifest")?.let {
                            JSONObject(it.toString())
                        } ?: JSONObject()
                        manifest.put("id", releaseJson.getString("id"))
                        manifest.put("version", releaseJson.optString("release_version", "1"))
                        manifest.put("branch_id", config.branchId)
                        manifest.put("branch_address", config.branchAddress)
                        manifest.put(
                            "effective_at_epoch_ms",
                            parseIsoEpochMillis(releaseJson.optString("activate_at"))
                        )
                        val release = ManifestJsonCodec.decode(manifest.toString())
                        if (release.isPlayable()) BackendResult.Success(release)
                        else BackendResult.Failure("Release không có nội dung phát")
                    } catch (error: Exception) {
                        BackendResult.Failure("Manifest trả về không hợp lệ", cause = error)
                    }
                }
            )
        }
    }

    override fun sendHeartbeat(
        config: DeviceConfig,
        snapshot: PlaybackSnapshot,
        callback: (BackendResult<Unit>) -> Unit
    ) {
        if (!isConfigured) {
            callback(BackendResult.Failure("Supabase chưa được cấu hình"))
            return
        }
        val hasError = snapshot.playbackState.contains("error", ignoreCase = true) ||
            snapshot.playbackState.contains("unavailable", ignoreCase = true)
        val body = JSONObject()
            .put("action", "heartbeat")
            .put("currentReleaseId", snapshot.releaseId ?: JSONObject.NULL)
            .put("readyReleaseId", snapshot.readyReleaseId ?: JSONObject.NULL)
            .put("currentItemKey", snapshot.playlistItemId ?: JSONObject.NULL)
            .put("lastError", if (hasError) snapshot.playbackState else JSONObject.NULL)
            .put("appVersion", snapshot.appVersion)
            .put("cacheState", JSONObject().put("state", snapshot.cacheState))
            .put(
                "deviceInfo",
                JSONObject()
                    .put("deviceId", snapshot.deviceId)
                    .put("screenId", config.screenId)
                    .put("branchId", snapshot.branchId)
                    .put("playbackState", snapshot.playbackState)
                    .put("clientTimestampEpochMs", snapshot.timestampEpochMs)
            )

        post(body, config.deviceToken) { result ->
            callback(
                when (result) {
                    is BackendResult.Failure -> result
                    is BackendResult.Success -> BackendResult.Success(Unit)
                }
            )
        }
    }

    private fun post(
        body: JSONObject,
        deviceToken: String?,
        callback: (BackendResult<String>) -> Unit
    ) {
        executor.execute {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(endpoint).openConnection() as HttpURLConnection)
                connection.requestMethod = "POST"
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("apikey", anonKey)
                connection.setRequestProperty(
                    "Authorization",
                    "Bearer ${deviceToken?.takeIf(String::isNotBlank) ?: anonKey}"
                )
                connection.outputStream.use { output ->
                    output.write(body.toString().toByteArray(Charsets.UTF_8))
                }

                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val payload = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
                if (status in 200..299) {
                    callback(BackendResult.Success(payload.ifBlank { "{}" }))
                } else {
                    val message = runCatching {
                        val json = JSONObject(payload)
                        json.optString("message").ifBlank { json.optString("error", payload) }
                    }.getOrDefault(payload).ifBlank { "HTTP $status" }
                    callback(BackendResult.Failure(message, httpCode = status))
                }
            } catch (error: Exception) {
                callback(BackendResult.Failure("Không thể kết nối Supabase", cause = error))
            } finally {
                connection?.disconnect()
            }
        }
    }

    override fun close() {
        executor.shutdownNow()
    }

    private fun JSONObject.objectOrFirst(key: String): JSONObject? {
        optJSONObject(key)?.let { return it }
        val array: JSONArray = optJSONArray(key) ?: return null
        return array.optJSONObject(0)
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 12_000
        const val READ_TIMEOUT_MS = 18_000

        fun parseIsoEpochMillis(value: String): Long {
            if (value.isBlank()) return 0L
            val normalizedZone = value
                .replace(Regex("([+-]\\d{2}):(\\d{2})$"), "$1$2")
                .replace(Regex("Z$", RegexOption.IGNORE_CASE), "+0000")
            val normalized = Regex("\\.(\\d+)([+-]\\d{4})$").replace(normalizedZone) { match ->
                val millis = match.groupValues[1].padEnd(3, '0').take(3)
                ".$millis${match.groupValues[2]}"
            }
            val patterns = listOf(
                "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
                "yyyy-MM-dd'T'HH:mm:ssZ"
            )
            for (pattern in patterns) {
                val parsed = runCatching {
                    val formatter = SimpleDateFormat(pattern, Locale.US)
                    formatter.isLenient = false
                    formatter.timeZone = TimeZone.getTimeZone("UTC")
                    formatter.parse(normalized)?.time
                }.getOrNull()
                if (parsed != null) return parsed
            }
            return 0L
        }
    }
}
