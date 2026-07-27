package vn.unite.vinhdanh.tv.data

enum class PlaylistItemType(val wireValue: String) {
    RECOGNITION("recognition"),
    VIDEO("video"),
    ANNOUNCEMENT("announcement");

    companion object {
        fun fromWire(value: String): PlaylistItemType =
            entries.firstOrNull { it.wireValue == value.lowercase() } ?: ANNOUNCEMENT
    }
}

data class RecognitionEntry(
    val rank: Int,
    val employeeId: String,
    val name: String,
    val role: String,
    val revenue: Long,
    val avatarUrl: String? = null
)

data class RecognitionBoard(
    val periodLabel: String,
    val categoryLabel: String,
    val entries: List<RecognitionEntry>
)

data class PlaylistItem(
    val id: String,
    val type: PlaylistItemType,
    val title: String,
    val durationSeconds: Int,
    val mediaUrl: String? = null,
    val mediaSha256: String? = null,
    val backgroundUrl: String? = null,
    val backgroundSha256: String? = null,
    val logoUrl: String? = null,
    val logoSha256: String? = null,
    val thumbnailUrl: String? = null,
    val thumbnailSha256: String? = null,
    val announcementBody: String? = null,
    val recognitionBoard: RecognitionBoard? = null
)

data class ReleaseManifest(
    val id: String,
    val version: String,
    val branchId: String,
    val branchAddress: String,
    val effectiveAtEpochMs: Long,
    val playlist: List<PlaylistItem>
) {
    fun isPlayable(): Boolean = id.isNotBlank() && playlist.isNotEmpty()
}

data class DeviceConfig(
    val deviceId: String,
    val deviceToken: String,
    val screenId: String,
    val branchId: String,
    val branchAddress: String
)

data class PendingPairing(
    val pairingCode: String,
    val deviceToken: String,
    val status: String,
    val expiresAtEpochMs: Long
) {
    fun isExpired(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        expiresAtEpochMs > 0L && nowEpochMs >= expiresAtEpochMs
}

data class PlaybackSnapshot(
    val deviceId: String,
    val branchId: String,
    val releaseId: String?,
    val readyReleaseId: String?,
    val releaseVersion: String?,
    val playlistItemId: String?,
    val playbackState: String,
    val cacheState: String,
    val appVersion: String,
    val timestampEpochMs: Long = System.currentTimeMillis()
)
