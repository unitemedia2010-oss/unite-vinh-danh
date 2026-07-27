package vn.unite.vinhdanh.tv.network

import vn.unite.vinhdanh.tv.data.DeviceConfig
import vn.unite.vinhdanh.tv.data.PendingPairing
import vn.unite.vinhdanh.tv.data.PlaybackSnapshot
import vn.unite.vinhdanh.tv.data.ReleaseManifest

sealed interface BackendResult<out T> {
    data class Success<T>(val value: T) : BackendResult<T>
    data class Failure(
        val message: String,
        val httpCode: Int? = null,
        val cause: Throwable? = null
    ) : BackendResult<Nothing>
}

data class RegistrationRequest(
    val deviceId: String,
    val appVersion: String,
    val deviceName: String
)

data class PairingStatus(
    val status: String,
    val config: DeviceConfig? = null
)

interface SignageBackend : AutoCloseable {
    val isConfigured: Boolean

    fun register(
        request: RegistrationRequest,
        callback: (BackendResult<PendingPairing>) -> Unit
    )

    fun checkPairingStatus(
        deviceId: String,
        pending: PendingPairing,
        callback: (BackendResult<PairingStatus>) -> Unit
    )

    fun fetchActiveRelease(
        config: DeviceConfig,
        callback: (BackendResult<ReleaseManifest>) -> Unit
    )

    fun sendHeartbeat(
        config: DeviceConfig,
        snapshot: PlaybackSnapshot,
        callback: (BackendResult<Unit>) -> Unit = {}
    )

    override fun close()
}
