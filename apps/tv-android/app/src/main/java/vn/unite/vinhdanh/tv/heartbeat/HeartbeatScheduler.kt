package vn.unite.vinhdanh.tv.heartbeat

import android.util.Log
import vn.unite.vinhdanh.tv.data.DeviceConfig
import vn.unite.vinhdanh.tv.data.PlaybackSnapshot
import vn.unite.vinhdanh.tv.network.BackendResult
import vn.unite.vinhdanh.tv.network.SignageBackend
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class HeartbeatScheduler(
    private val backend: SignageBackend,
    private val config: DeviceConfig,
    private val snapshotProvider: () -> PlaybackSnapshot,
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
) : AutoCloseable {

    fun start() {
        scheduler.scheduleWithFixedDelay(
            ::send,
            INITIAL_DELAY_SECONDS,
            INTERVAL_SECONDS,
            TimeUnit.SECONDS
        )
    }

    private fun send() {
        if (!backend.isConfigured) return
        backend.sendHeartbeat(config, snapshotProvider()) { result ->
            if (result is BackendResult.Failure) {
                Log.w(TAG, "Heartbeat failed: ${result.message}", result.cause)
            }
        }
    }

    override fun close() {
        scheduler.shutdownNow()
    }

    private companion object {
        const val TAG = "HeartbeatScheduler"
        const val INITIAL_DELAY_SECONDS = 5L
        const val INTERVAL_SECONDS = 30L
    }
}
