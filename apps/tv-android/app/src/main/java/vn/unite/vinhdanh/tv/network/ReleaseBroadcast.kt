package vn.unite.vinhdanh.tv.network

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min

data class BroadcastConnectionSpec(
    val supabaseUrl: String,
    val anonKey: String,
    val branchId: String
) {
    /**
     * publish-release broadcasts globally to "screen-updates". Each TV then asks screen-api for
     * its own manifest, so a broadcast never grants access to another screen's release.
     */
    val topic: String get() = "realtime:$CHANNEL"

    val socketUrl: String
        get() {
            val schemeUrl = supabaseUrl.trimEnd('/')
                .replaceFirst("https://", "wss://")
                .replaceFirst("http://", "ws://")
            val encodedKey = URLEncoder.encode(anonKey, Charsets.UTF_8.name())
            return "$schemeUrl/realtime/v1/websocket?apikey=$encodedKey&vsn=1.0.0"
        }

    companion object {
        const val CHANNEL = "screen-updates"
    }
}

interface ReleaseBroadcast : AutoCloseable {
    interface Listener {
        fun onConnected(topic: String)
        fun onReleasePublished(releaseId: String)
        fun onDisconnected(reason: String)
    }

    fun connect(spec: BroadcastConnectionSpec, listener: Listener)
    fun disconnect()
    override fun close()
}

internal sealed interface RealtimeSignal {
    data class Joined(val topic: String) : RealtimeSignal
    data class ReleasePublished(val releaseId: String) : RealtimeSignal
    data class ChannelError(val reason: String) : RealtimeSignal
}

/**
 * Decoder for both Phoenix object frames (vsn=1.0.0) and the array frame used by newer
 * serializers. Keeping it separate makes the wire contract unit-testable without a TV.
 */
internal object SupabaseRealtimeMessageParser {
    fun parse(raw: String): RealtimeSignal? = runCatching {
        val trimmed = raw.trim()
        if (trimmed.startsWith("[")) parseArray(JSONArray(trimmed))
        else parseObject(JSONObject(trimmed))
    }.getOrNull()

    private fun parseArray(frame: JSONArray): RealtimeSignal? {
        if (frame.length() < 5) return null
        val topic = frame.optString(2)
        val event = frame.optString(3)
        val payload = frame.optJSONObject(4) ?: JSONObject()
        return signal(topic, event, payload)
    }

    private fun parseObject(frame: JSONObject): RealtimeSignal? =
        signal(
            frame.optString("topic"),
            frame.optString("event"),
            frame.optJSONObject("payload") ?: JSONObject()
        )

    private fun signal(topic: String, event: String, payload: JSONObject): RealtimeSignal? {
        if (
            event == "phx_reply" &&
            payload.optString("status") == "ok" &&
            topic.startsWith("realtime:")
        ) {
            return RealtimeSignal.Joined(topic)
        }
        if (event == "phx_error" || event == "phx_close") {
            return RealtimeSignal.ChannelError(event)
        }

        val broadcastEvent = if (event == "broadcast") payload.optString("event") else event
        if (broadcastEvent != RELEASE_PUBLISHED_EVENT) return null
        val eventPayload = payload.optJSONObject("payload") ?: payload
        val releaseId = eventPayload.optString("releaseId")
            .ifBlank { eventPayload.optString("release_id") }
        return RealtimeSignal.ReleasePublished(releaseId)
    }

    private const val RELEASE_PUBLISHED_EVENT = "release-published"
}

/**
 * Supabase Realtime Broadcast transport.
 *
 * Polling screen-api remains authoritative. Broadcast only shortens the delay by triggering an
 * immediate manifest fetch. The client reconnects with bounded exponential backoff and sends the
 * Phoenix heartbeat required by Realtime in addition to OkHttp's websocket ping.
 */
class SupabaseReleaseBroadcast(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build(),
    private val scheduler: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor()
) : ReleaseBroadcast {
    private val lock = Any()
    private val refs = AtomicLong(0L)
    private val connectionIds = AtomicLong(0L)

    private var generation = 0L
    private var activeSpec: BroadcastConnectionSpec? = null
    private var activeListener: ReleaseBroadcast.Listener? = null
    private var socket: WebSocket? = null
    private var activeConnectionId = 0L
    private var reconnectFuture: ScheduledFuture<*>? = null
    private var heartbeatFuture: ScheduledFuture<*>? = null
    private var retryAttempt = 0
    private var stopped = true
    private var closed = false

    override fun connect(
        spec: BroadcastConnectionSpec,
        listener: ReleaseBroadcast.Listener
    ) {
        val nextGeneration: Long
        synchronized(lock) {
            if (closed) return
            stopSocketLocked()
            generation += 1L
            nextGeneration = generation
            activeSpec = spec
            activeListener = listener
            retryAttempt = 0
            stopped = false
        }
        openSocket(nextGeneration)
    }

    private fun openSocket(expectedGeneration: Long) {
        val spec = synchronized(lock) {
            if (closed || stopped || generation != expectedGeneration) return
            activeSpec
        } ?: return
        val connectionId = connectionIds.incrementAndGet()
        synchronized(lock) {
            if (closed || stopped || generation != expectedGeneration) return
            activeConnectionId = connectionId
        }

        val request = Request.Builder()
            .url(spec.socketUrl)
            .header("apikey", spec.anonKey)
            .header("Authorization", "Bearer ${spec.anonKey}")
            .build()

        val created = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    synchronized(lock) {
                        if (
                            closed ||
                            stopped ||
                            generation != expectedGeneration ||
                            activeConnectionId != connectionId
                        ) {
                            webSocket.close(NORMAL_CLOSE_CODE, "stale")
                            return
                        }
                        socket = webSocket
                    }
                    if (!webSocket.send(joinFrame(spec))) {
                        webSocket.cancel()
                        handleDisconnect(
                            expectedGeneration,
                            connectionId,
                            "Không gửi được phx_join"
                        )
                        return
                    }
                    startHeartbeat(expectedGeneration)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    when (val signal = SupabaseRealtimeMessageParser.parse(text)) {
                        is RealtimeSignal.Joined -> {
                            if (signal.topic == spec.topic) {
                                synchronized(lock) {
                                    if (
                                        generation == expectedGeneration &&
                                        activeConnectionId == connectionId
                                    ) {
                                        retryAttempt = 0
                                    }
                                }
                                currentListener(expectedGeneration, connectionId)
                                    ?.onConnected(spec.topic)
                            }
                        }
                        is RealtimeSignal.ReleasePublished -> {
                            currentListener(expectedGeneration, connectionId)
                                ?.onReleasePublished(signal.releaseId)
                        }
                        is RealtimeSignal.ChannelError -> {
                            webSocket.cancel()
                            handleDisconnect(expectedGeneration, connectionId, signal.reason)
                        }
                        null -> Unit
                    }
                }

                override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                    onMessage(webSocket, bytes.utf8())
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    handleDisconnect(
                        expectedGeneration,
                        connectionId,
                        reason.ifBlank { "WebSocket đã đóng ($code)" }
                    )
                }

                override fun onFailure(
                    webSocket: WebSocket,
                    t: Throwable,
                    response: Response?
                ) {
                    val reason = buildString {
                        append(t.message ?: "Lỗi WebSocket")
                        response?.code?.let { append(" · HTTP ").append(it) }
                    }
                    handleDisconnect(expectedGeneration, connectionId, reason)
                }
            }
        )

        synchronized(lock) {
            if (
                closed ||
                stopped ||
                generation != expectedGeneration ||
                activeConnectionId != connectionId
            ) {
                created.close(NORMAL_CLOSE_CODE, "stale")
            } else {
                socket = created
            }
        }
    }

    private fun joinFrame(spec: BroadcastConnectionSpec): String {
        val payload = JSONObject()
            .put(
                "config",
                JSONObject()
                    .put(
                        "broadcast",
                        JSONObject().put("ack", false).put("self", false)
                    )
                    .put("presence", JSONObject().put("key", ""))
                    .put("postgres_changes", JSONArray())
            )
            .put("access_token", spec.anonKey)
        return frame(spec.topic, "phx_join", payload)
    }

    private fun startHeartbeat(expectedGeneration: Long) {
        synchronized(lock) {
            heartbeatFuture?.cancel(false)
            heartbeatFuture = scheduler.scheduleWithFixedDelay(
                {
                    val currentSocket = synchronized(lock) {
                        if (closed || stopped || generation != expectedGeneration) null else socket
                    }
                    currentSocket?.send(frame("phoenix", "heartbeat", JSONObject()))
                },
                HEARTBEAT_SECONDS,
                HEARTBEAT_SECONDS,
                TimeUnit.SECONDS
            )
        }
    }

    private fun frame(topic: String, event: String, payload: JSONObject): String {
        val ref = refs.incrementAndGet().toString()
        return JSONObject()
            .put("topic", topic)
            .put("event", event)
            .put("payload", payload)
            .put("ref", ref)
            .toString()
    }

    private fun currentListener(
        expectedGeneration: Long,
        connectionId: Long
    ): ReleaseBroadcast.Listener? =
        synchronized(lock) {
            if (
                closed ||
                stopped ||
                generation != expectedGeneration ||
                activeConnectionId != connectionId
            ) null else activeListener
        }

    private fun handleDisconnect(
        expectedGeneration: Long,
        connectionId: Long,
        reason: String
    ) {
        val safeReason = sanitizeReason(reason)
        val listener: ReleaseBroadcast.Listener?
        val reconnectDelaySeconds: Long
        synchronized(lock) {
            if (
                closed ||
                stopped ||
                generation != expectedGeneration ||
                activeConnectionId != connectionId
            ) return
            socket = null
            activeConnectionId = 0L
            heartbeatFuture?.cancel(false)
            heartbeatFuture = null
            listener = activeListener
            reconnectFuture?.cancel(false)
            reconnectDelaySeconds = retryDelaySeconds(retryAttempt)
            retryAttempt += 1
            reconnectFuture = scheduler.schedule(
                { openSocket(expectedGeneration) },
                reconnectDelaySeconds,
                TimeUnit.SECONDS
            )
        }
        Log.w(TAG, "Realtime disconnected; retry in ${reconnectDelaySeconds}s: $safeReason")
        listener?.onDisconnected(safeReason)
    }

    private fun sanitizeReason(reason: String): String = reason.replace(
        Regex("(?i)([?&](?:apikey|token|access_token)=)[^&\\s]+")
    ) { match -> "${match.groupValues[1]}<redacted>" }

    private fun retryDelaySeconds(attempt: Int): Long {
        val exponent = 1L shl min(attempt, 5)
        return min(exponent, MAX_RETRY_SECONDS)
    }

    override fun disconnect() {
        synchronized(lock) {
            generation += 1L
            stopped = true
            activeSpec = null
            activeListener = null
            retryAttempt = 0
            stopSocketLocked()
        }
    }

    private fun stopSocketLocked() {
        reconnectFuture?.cancel(false)
        reconnectFuture = null
        heartbeatFuture?.cancel(false)
        heartbeatFuture = null
        socket?.close(NORMAL_CLOSE_CODE, "client disconnect")
        socket = null
        activeConnectionId = 0L
    }

    override fun close() {
        synchronized(lock) {
            if (closed) return
            closed = true
            generation += 1L
            stopped = true
            activeSpec = null
            activeListener = null
            stopSocketLocked()
        }
        scheduler.shutdownNow()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
    }

    private companion object {
        const val TAG = "ReleaseBroadcast"
        const val NORMAL_CLOSE_CODE = 1000
        const val HEARTBEAT_SECONDS = 25L
        const val MAX_RETRY_SECONDS = 30L
    }
}
