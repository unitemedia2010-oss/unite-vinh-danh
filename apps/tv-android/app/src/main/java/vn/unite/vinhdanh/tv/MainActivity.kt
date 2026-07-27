package vn.unite.vinhdanh.tv

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import vn.unite.vinhdanh.tv.data.DeviceConfig
import vn.unite.vinhdanh.tv.data.DeviceConfigStore
import vn.unite.vinhdanh.tv.data.MockReleaseFactory
import vn.unite.vinhdanh.tv.data.PendingPairing
import vn.unite.vinhdanh.tv.data.PlaybackSnapshot
import vn.unite.vinhdanh.tv.data.PlaylistItem
import vn.unite.vinhdanh.tv.data.PlaylistItemType
import vn.unite.vinhdanh.tv.data.ReleaseCache
import vn.unite.vinhdanh.tv.data.ReleaseManifest
import vn.unite.vinhdanh.tv.heartbeat.HeartbeatScheduler
import vn.unite.vinhdanh.tv.network.BackendResult
import vn.unite.vinhdanh.tv.network.BroadcastConnectionSpec
import vn.unite.vinhdanh.tv.network.ReleaseBroadcast
import vn.unite.vinhdanh.tv.network.RegistrationRequest
import vn.unite.vinhdanh.tv.network.SignageBackend
import vn.unite.vinhdanh.tv.network.SupabaseReleaseBroadcast
import vn.unite.vinhdanh.tv.network.SupabaseSignageBackend
import vn.unite.vinhdanh.tv.player.MediaFileCache
import vn.unite.vinhdanh.tv.player.MediaResolution
import vn.unite.vinhdanh.tv.player.ReleaseAssetKind
import vn.unite.vinhdanh.tv.player.ReleaseAssetLoader
import vn.unite.vinhdanh.tv.player.ReleaseMediaPrefetcher
import vn.unite.vinhdanh.tv.ui.RecognitionRenderer
import java.io.File
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

class MainActivity : Activity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val destroyed = AtomicBoolean(false)

    private lateinit var configStore: DeviceConfigStore
    private lateinit var releaseCache: ReleaseCache
    private lateinit var mediaCache: MediaFileCache
    private lateinit var releaseMediaPrefetcher: ReleaseMediaPrefetcher
    private lateinit var backend: SignageBackend
    private val broadcast: ReleaseBroadcast = SupabaseReleaseBroadcast()

    private lateinit var pairingPanel: View
    private lateinit var playbackPanel: View
    private lateinit var pairingCodeView: TextView
    private lateinit var pairingDeviceInfoView: TextView
    private lateinit var pairingStatusView: TextView
    private lateinit var pairNowButton: Button
    private lateinit var demoButton: Button
    private lateinit var branchAddressView: TextView
    private lateinit var playerStatusView: TextView
    private lateinit var recognitionView: View
    private lateinit var recognitionHeadingView: TextView
    private lateinit var recognitionSubtitleView: TextView
    private lateinit var videoView: View
    private lateinit var videoStatusView: TextView
    private lateinit var playerView: PlayerView
    private lateinit var announcementView: View
    private lateinit var announcementTitleView: TextView
    private lateinit var announcementBodyView: TextView
    private lateinit var slideBackgroundView: ImageView
    private lateinit var slideLogoView: ImageView
    private lateinit var recognitionRenderer: RecognitionRenderer

    @Volatile
    private var activeConfig: DeviceConfig? = null

    @Volatile
    private var activeRelease: ReleaseManifest? = null

    @Volatile
    private var pendingRelease: ReleaseManifest? = null

    @Volatile
    private var pendingReleaseReady = false

    @Volatile
    private var activeItem: PlaylistItem? = null

    @Volatile
    private var playbackState: String = "booting"

    @Volatile
    private var cacheState: String = "unknown"

    private var activeIndex = 0
    private var exoPlayer: ExoPlayer? = null
    private var heartbeatScheduler: HeartbeatScheduler? = null
    private var pendingPairing: PendingPairing? = null
    private val pairingInFlight = AtomicBoolean(false)
    private val releaseRefreshInFlight = AtomicBoolean(false)
    private var consecutiveRefreshFailures = 0
    private var realtimeConnected = false
    private var prefetchingReleaseIdentity: String? = null

    private val advanceRunnable = Runnable(::advancePlaylist)
    private val pairingPollRunnable = Runnable(::checkPairingStatus)
    private val pendingActivationRunnable = Runnable(::activatePendingReleaseIfDue)
    private val releaseRefreshRunnable = object : Runnable {
        override fun run() {
            refreshReleaseFromBackend()
            if (!destroyed.get()) mainHandler.postDelayed(this, RELEASE_REFRESH_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enterImmersiveMode()
        setContentView(R.layout.activity_main)

        configStore = DeviceConfigStore(this)
        releaseCache = ReleaseCache(this)
        mediaCache = MediaFileCache(this)
        backend = SupabaseSignageBackend(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)

        bindViews()
        releaseMediaPrefetcher = ReleaseMediaPrefetcher(
            ReleaseAssetLoader { asset, callback ->
                if (asset.kind == ReleaseAssetKind.AVATAR) {
                    recognitionRenderer.prefetchAvatar(asset.url, callback)
                } else {
                    mediaCache.resolve(asset.url, asset.sha256) { resolution ->
                        callback(resolution is MediaResolution.Ready)
                    }
                }
            }
        )
        configStore.readPairedConfig()?.let(::startPlayer) ?: showPairing()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    private fun bindViews() {
        pairingPanel = findViewById(R.id.pairing_panel)
        playbackPanel = findViewById(R.id.playback_panel)
        pairingCodeView = findViewById(R.id.pairing_code)
        pairingDeviceInfoView = findViewById(R.id.pairing_device_info)
        pairingStatusView = findViewById(R.id.pairing_status)
        pairNowButton = findViewById(R.id.pair_now_button)
        demoButton = findViewById(R.id.demo_button)
        branchAddressView = findViewById(R.id.branch_address)
        playerStatusView = findViewById(R.id.player_status)
        recognitionView = findViewById(R.id.recognition_view)
        recognitionHeadingView = findViewById(R.id.recognition_heading)
        recognitionSubtitleView = findViewById(R.id.recognition_subtitle)
        videoView = findViewById(R.id.video_view)
        videoStatusView = findViewById(R.id.video_status)
        playerView = findViewById(R.id.media_player_view)
        announcementView = findViewById(R.id.announcement_view)
        announcementTitleView = findViewById(R.id.announcement_title)
        announcementBodyView = findViewById(R.id.announcement_body)
        slideBackgroundView = findViewById(R.id.slide_background)
        slideLogoView = findViewById(R.id.slide_logo)
        recognitionRenderer = RecognitionRenderer(
            this,
            findViewById<LinearLayout>(R.id.top_three_container),
            findViewById<LinearLayout>(R.id.runner_column_left),
            findViewById<LinearLayout>(R.id.runner_column_right)
        )
    }

    private fun showPairing() {
        heartbeatScheduler?.close()
        heartbeatScheduler = null
        broadcast.disconnect()
        realtimeConnected = false
        releaseRefreshInFlight.set(false)
        mainHandler.removeCallbacks(pendingActivationRunnable)
        pendingRelease = null
        pendingReleaseReady = false
        prefetchingReleaseIdentity = null
        activeConfig = null
        playbackState = "pairing"
        pairingPanel.visibility = View.VISIBLE
        playbackPanel.visibility = View.GONE
        mainHandler.removeCallbacks(releaseRefreshRunnable)
        mainHandler.removeCallbacks(pairingPollRunnable)

        val deviceId = configStore.getOrCreateDeviceId()
        pairingCodeView.text = "--- ---"
        pairingDeviceInfoView.text = buildString {
            append("Thiết bị: ")
            append(deviceId.take(8).uppercase())
            append("  ·  ")
            append(Build.MANUFACTURER)
            append(' ')
            append(Build.MODEL)
            append("\nChi nhánh mặc định: ")
            append(MockReleaseFactory.BRANCH_ADDRESS)
        }
        pairingStatusView.text = if (backend.isConfigured) {
            "Sẵn sàng kết nối an toàn với Admin"
        } else {
            "Chưa cấu hình Supabase · có thể chạy bản demo"
        }

        pairNowButton.text = "KIỂM TRA GHÉP NỐI"
        pairNowButton.setOnClickListener {
            val pending = pendingPairing ?: configStore.readPendingPairing()
            if (pending == null || pending.isExpired()) beginRegistration(deviceId)
            else {
                pendingPairing = pending
                checkPairingStatus()
            }
        }
        demoButton.setOnClickListener {
            val config = DeviceConfig(
                deviceId = deviceId,
                deviceToken = "demo-${deviceId.take(12)}",
                screenId = "demo-pilot-screen",
                branchId = MockReleaseFactory.BRANCH_ID,
                branchAddress = MockReleaseFactory.BRANCH_ADDRESS
            )
            configStore.savePairedConfig(config)
            startPlayer(config)
        }
        if (backend.isConfigured) {
            pairNowButton.post { pairNowButton.requestFocus() }
            beginRegistration(deviceId)
        } else {
            demoButton.post { demoButton.requestFocus() }
        }
    }

    private fun beginRegistration(deviceId: String = configStore.getOrCreateDeviceId()) {
        if (!backend.isConfigured) {
            pairingStatusView.text = "Hãy tạo local.properties từ local.properties.example"
            return
        }
        val saved = configStore.readPendingPairing()
        if (saved != null && !saved.isExpired()) {
            pendingPairing = saved
            showServerPairingCode(saved)
            schedulePairingStatus(500L)
            return
        }
        configStore.clearPendingPairing()
        pendingPairing = null
        if (!pairingInFlight.compareAndSet(false, true)) return
        pairNowButton.isEnabled = false
        pairingCodeView.text = "--- ---"
        pairingStatusView.text = "Đang đăng ký thiết bị với Admin…"
        backend.register(
            RegistrationRequest(
                deviceId = deviceId,
                appVersion = BuildConfig.VERSION_NAME,
                deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
            )
        ) { result ->
            runOnUiThread {
                if (destroyed.get()) return@runOnUiThread
                pairingInFlight.set(false)
                pairNowButton.isEnabled = true
                when (result) {
                    is BackendResult.Success -> {
                        pendingPairing = result.value
                        configStore.savePendingPairing(result.value)
                        showServerPairingCode(result.value)
                        schedulePairingStatus(1_000L)
                    }
                    is BackendResult.Failure -> {
                        pairingStatusView.text = "Không thể đăng ký TV: ${result.message}"
                    }
                }
            }
        }
    }

    private fun showServerPairingCode(pending: PendingPairing) {
        pairingCodeView.text = pending.pairingCode.chunked(3).joinToString(" ")
        pairingStatusView.text = "Nhập mã này trên Admin · đang chờ phê duyệt"
    }

    private fun checkPairingStatus() {
        val pending = pendingPairing ?: configStore.readPendingPairing()
        if (pending == null || pending.isExpired()) {
            configStore.clearPendingPairing()
            pendingPairing = null
            beginRegistration()
            return
        }
        pendingPairing = pending
        if (!pairingInFlight.compareAndSet(false, true)) return
        pairNowButton.isEnabled = false
        pairingStatusView.text = getString(R.string.pair_waiting)
        backend.checkPairingStatus(configStore.getOrCreateDeviceId(), pending) { result ->
            runOnUiThread {
                if (destroyed.get()) return@runOnUiThread
                pairingInFlight.set(false)
                pairNowButton.isEnabled = true
                when (result) {
                    is BackendResult.Success -> {
                        val config = result.value.config
                        if (result.value.status == "approved" && config != null) {
                            configStore.savePairedConfig(config)
                            pendingPairing = null
                            mainHandler.removeCallbacks(pairingPollRunnable)
                            startPlayer(config)
                        } else {
                            pairingStatusView.text = "Đang chờ Admin phê duyệt · ${result.value.status}"
                            schedulePairingStatus(PAIRING_POLL_MS)
                        }
                    }
                    is BackendResult.Failure -> {
                        if (result.httpCode == 401 || result.httpCode == 410) {
                            configStore.clearPendingPairing()
                            pendingPairing = null
                            beginRegistration()
                        } else {
                            pairingStatusView.text = "Chưa ghép nối: ${result.message}"
                            schedulePairingStatus(PAIRING_POLL_MS)
                        }
                    }
                }
            }
        }
    }

    private fun schedulePairingStatus(delayMs: Long) {
        mainHandler.removeCallbacks(pairingPollRunnable)
        if (!destroyed.get() && activeConfig == null) {
            mainHandler.postDelayed(pairingPollRunnable, delayMs)
        }
    }

    private fun startPlayer(config: DeviceConfig) {
        mainHandler.removeCallbacks(pairingPollRunnable)
        mainHandler.removeCallbacks(pendingActivationRunnable)
        pairingInFlight.set(false)
        releaseRefreshInFlight.set(false)
        consecutiveRefreshFailures = 0
        realtimeConnected = false
        pendingRelease = null
        pendingReleaseReady = false
        prefetchingReleaseIdentity = null
        activeConfig = config
        pairingPanel.visibility = View.GONE
        playbackPanel.visibility = View.VISIBLE
        branchAddressView.text = config.branchAddress
        playerStatusView.text = "● KHỞI ĐỘNG PLAYER"

        val now = System.currentTimeMillis()
        var cachedCurrent = releaseCache.loadCurrent()
            ?.takeIf { it.branchId == config.branchId }
        var cachedReady = releaseCache.loadReady()
            ?.takeIf { it.branchId == config.branchId }

        // Migrate a future release that older app versions may have stored as "current".
        if (cachedCurrent != null && cachedCurrent.effectiveAtEpochMs > now) {
            if (cachedReady == null) {
                releaseCache.saveReady(cachedCurrent)
                cachedReady = cachedCurrent
            }
            releaseCache.clearCurrent()
            cachedCurrent = null
        }

        val initialRelease = cachedCurrent ?: MockReleaseFactory.create().copy(
            branchId = config.branchId,
            branchAddress = config.branchAddress
        )
        cacheState = if (cachedCurrent != null) "last-known-release" else "mock-fallback"
        activateRelease(initialRelease, persist = cachedCurrent != null)

        cachedReady
            ?.takeUnless { it.sameIdentity(initialRelease) }
            ?.let(::activateOrSchedule)

        heartbeatScheduler?.close()
        heartbeatScheduler = HeartbeatScheduler(backend, config, ::heartbeatSnapshot).also { it.start() }
        connectBroadcast(config)

        mainHandler.removeCallbacks(releaseRefreshRunnable)
        mainHandler.post(releaseRefreshRunnable)
    }

    private fun connectBroadcast(config: DeviceConfig) {
        if (!backend.isConfigured) return
        broadcast.connect(
            BroadcastConnectionSpec(
                supabaseUrl = BuildConfig.SUPABASE_URL,
                anonKey = BuildConfig.SUPABASE_ANON_KEY,
                branchId = config.branchId
            ),
            object : ReleaseBroadcast.Listener {
                override fun onConnected(topic: String) {
                    runOnUiThread {
                        if (destroyed.get() || activeConfig?.deviceToken != config.deviceToken) {
                            return@runOnUiThread
                        }
                        realtimeConnected = true
                        updateOnlineStatus()
                    }
                }

                override fun onReleasePublished(releaseId: String) {
                    refreshReleaseFromBackend()
                }

                override fun onDisconnected(reason: String) {
                    runOnUiThread {
                        if (destroyed.get() || activeConfig?.deviceToken != config.deviceToken) {
                            return@runOnUiThread
                        }
                        realtimeConnected = false
                        updateOnlineStatus()
                    }
                }
            }
        )
    }

    private fun refreshReleaseFromBackend() {
        val config = activeConfig ?: return
        if (!backend.isConfigured) return
        if (!releaseRefreshInFlight.compareAndSet(false, true)) return
        backend.fetchActiveRelease(config) { result ->
            releaseRefreshInFlight.set(false)
            if (activeConfig?.deviceToken != config.deviceToken) return@fetchActiveRelease
            if (result is BackendResult.Failure) {
                if (result.httpCode == 401 || result.httpCode == 410) {
                    runOnUiThread {
                        if (destroyed.get()) return@runOnUiThread
                        heartbeatScheduler?.close()
                        heartbeatScheduler = null
                        broadcast.disconnect()
                        configStore.clearPairing()
                        showPairing()
                    }
                } else {
                    runOnUiThread {
                        if (destroyed.get() || activeConfig?.deviceToken != config.deviceToken) {
                            return@runOnUiThread
                        }
                        consecutiveRefreshFailures += 1
                        if (consecutiveRefreshFailures >= 2) {
                            playerStatusView.text = "● OFFLINE · ĐANG PHÁT BẢN ĐÃ LƯU"
                        }
                    }
                }
                return@fetchActiveRelease
            }
            if (result !is BackendResult.Success) return@fetchActiveRelease
            val incoming = result.value
            runOnUiThread {
                if (destroyed.get() || activeConfig?.deviceToken != config.deviceToken) {
                    return@runOnUiThread
                }
                consecutiveRefreshFailures = 0
                handleIncomingRelease(incoming)
            }
        }
    }

    private fun handleIncomingRelease(incoming: ReleaseManifest) {
        val config = activeConfig ?: return
        if (incoming.branchId != config.branchId) return

        val active = activeRelease
        val ready = pendingRelease
        when {
            active?.sameIdentity(incoming) == true -> {
                if (ready != null && !ready.sameIdentity(incoming)) {
                    mainHandler.removeCallbacks(pendingActivationRunnable)
                    pendingRelease = null
                    pendingReleaseReady = false
                    releaseCache.clearReady()
                }
                // Refresh expiring signed media/avatar URLs without interrupting the current item.
                activeRelease = incoming
                releaseCache.saveCurrent(incoming)
                cacheState = "release-${incoming.version}-refreshed"
                updateOnlineStatus()
            }
            ready?.sameIdentity(incoming) == true -> {
                releaseCache.saveReady(incoming)
                activateOrSchedule(incoming)
            }
            else -> activateOrSchedule(incoming)
        }
    }

    private fun activateOrSchedule(release: ReleaseManifest) {
        mainHandler.removeCallbacks(pendingActivationRunnable)
        val waitMs = release.effectiveAtEpochMs - System.currentTimeMillis()
        val wasPending = pendingRelease?.sameIdentity(release) == true
        if (!wasPending) pendingReleaseReady = false
        pendingRelease = release
        releaseCache.saveReady(release)
        prefetchPendingRelease(release)
        if (waitMs > 0L) {
            playerStatusView.text = if (pendingReleaseReady) {
                "● MEDIA ĐÃ SẴN SÀNG · CHỜ GIỜ PHÁT"
            } else {
                "● ĐANG TẢI MEDIA · VẪN PHÁT BẢN HIỆN TẠI"
            }
            mainHandler.removeCallbacks(pendingActivationRunnable)
            mainHandler.postDelayed(
                pendingActivationRunnable,
                min(waitMs, MAX_SCHEDULE_DELAY_MS)
            )
        } else {
            activatePendingReleaseIfDue()
        }
    }

    private fun prefetchPendingRelease(release: ReleaseManifest) {
        val identity = release.cacheIdentity()
        if (pendingReleaseReady || prefetchingReleaseIdentity == identity) return
        prefetchingReleaseIdentity = identity
        cacheState = "release-${release.version}-prefetching"

        releaseMediaPrefetcher.prefetch(release) { result ->
            runOnUiThread {
                if (destroyed.get()) return@runOnUiThread
                if (prefetchingReleaseIdentity == identity) {
                    prefetchingReleaseIdentity = null
                }
                if (pendingRelease?.sameIdentity(release) != true) return@runOnUiThread

                pendingReleaseReady = result.canActivate
                cacheState = when {
                    !result.canActivate ->
                        "release-${release.version}-required-media-missing-${result.requiredFailures}"
                    result.failed > 0 ->
                        "release-${release.version}-ready-with-${result.failed}-optional-misses"
                    else -> "release-${release.version}-ready-${result.cached}-assets"
                }
                if (result.canActivate) {
                    playerStatusView.text = if (
                        release.effectiveAtEpochMs > System.currentTimeMillis()
                    ) {
                        "● MEDIA ĐÃ SẴN SÀNG · CHỜ GIỜ PHÁT"
                    } else {
                        "● MEDIA ĐÃ SẴN SÀNG · ĐANG KÍCH HOẠT"
                    }
                    activatePendingReleaseIfDue()
                } else {
                    playerStatusView.text =
                        "● CHƯA ĐỦ MEDIA BẮT BUỘC · GIỮ BẢN HIỆN TẠI"
                }
            }
        }
    }

    private fun activatePendingReleaseIfDue() {
        val release = pendingRelease ?: return
        val waitMs = release.effectiveAtEpochMs - System.currentTimeMillis()
        if (waitMs > 0L) {
            mainHandler.removeCallbacks(pendingActivationRunnable)
            mainHandler.postDelayed(pendingActivationRunnable, min(waitMs, MAX_SCHEDULE_DELAY_MS))
        } else if (pendingReleaseReady) {
            activateRelease(release)
        } else {
            playerStatusView.text = "● ĐANG CHỜ MEDIA · GIỮ BẢN HIỆN TẠI"
            prefetchPendingRelease(release)
        }
    }

    private fun activateRelease(release: ReleaseManifest, persist: Boolean = true) {
        if (!release.isPlayable()) return
        if (pendingRelease?.sameIdentity(release) == true) {
            pendingRelease = null
            pendingReleaseReady = false
            releaseCache.clearReady()
            mainHandler.removeCallbacks(pendingActivationRunnable)
        }
        activeRelease = release
        activeIndex = 0
        if (persist) releaseCache.saveCurrent(release)
        cacheState = if (persist) "release-${release.version}-active" else "mock-fallback"
        branchAddressView.text = release.branchAddress
        updateOnlineStatus()
        playCurrentItem()
    }

    private fun updateOnlineStatus() {
        val release = activeRelease ?: return
        val transport = if (realtimeConnected) "REALTIME" else "POLLING"
        playerStatusView.text = "● ONLINE · $transport · ${release.version}"
    }

    private fun ReleaseManifest.sameIdentity(other: ReleaseManifest): Boolean =
        id == other.id && version == other.version

    private fun ReleaseManifest.cacheIdentity(): String = "$id:$version"

    private fun playCurrentItem() {
        mainHandler.removeCallbacks(advanceRunnable)
        releaseMediaPlayer()

        val playlist = activeRelease?.playlist.orEmpty()
        if (playlist.isEmpty()) {
            playbackState = "empty-release"
            playerStatusView.text = "● RELEASE KHÔNG CÓ NỘI DUNG"
            return
        }
        activeIndex %= playlist.size
        val item = playlist[activeIndex]
        activeItem = item
        hideContentViews()
        showSlideArtwork(item)

        when (item.type) {
            PlaylistItemType.RECOGNITION -> showRecognition(item)
            PlaylistItemType.VIDEO -> showVideo(item)
            PlaylistItemType.ANNOUNCEMENT -> showAnnouncement(item)
        }
    }

    private fun showRecognition(item: PlaylistItem) {
        val board = item.recognitionBoard
        if (board == null) {
            playbackState = "invalid-recognition"
            scheduleAdvance(3)
            return
        }
        playbackState = "playing-recognition"
        recognitionView.visibility = View.VISIBLE
        recognitionHeadingView.text = item.title.uppercase()
        recognitionSubtitleView.text = "${board.categoryLabel}  ·  ${board.periodLabel}"
        recognitionRenderer.render(board)
        scheduleAdvance(item.durationSeconds)
    }

    private fun showAnnouncement(item: PlaylistItem) {
        playbackState = "playing-announcement"
        announcementView.visibility = View.VISIBLE
        announcementTitleView.text = item.title
        announcementBodyView.text = item.announcementBody.orEmpty()
        scheduleAdvance(item.durationSeconds)
    }

    private fun showVideo(item: PlaylistItem) {
        playbackState = "prefetching-video"
        videoView.visibility = View.VISIBLE
        videoStatusView.visibility = View.VISIBLE
        videoStatusView.text = "Đang chuẩn bị video offline…"
        val url = item.mediaUrl
        if (url.isNullOrBlank()) {
            videoStatusView.text = "Playlist chưa cấu hình video"
            scheduleAdvance(3)
            return
        }

        mediaCache.resolve(url, item.mediaSha256) { resolution ->
            runOnUiThread {
                if (destroyed.get() || activeItem?.id != item.id) return@runOnUiThread
                when (resolution) {
                    is MediaResolution.Failure -> {
                        playbackState = "video-unavailable"
                        cacheState = "video-miss"
                        videoStatusView.text = resolution.message
                        scheduleAdvance(4)
                    }
                    is MediaResolution.Ready -> {
                        cacheState = if (resolution.fromCache) "video-cache-hit" else "video-cached"
                        startMedia3Playback(item, Uri.fromFile(resolution.file))
                    }
                }
            }
        }
    }

    private fun startMedia3Playback(item: PlaylistItem, uri: Uri) {
        playbackState = "playing-video"
        videoStatusView.visibility = View.GONE
        val player = ExoPlayer.Builder(this).build().also { created ->
            created.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                true
            )
            created.volume = 1f
            created.repeatMode = Player.REPEAT_MODE_OFF
            created.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_ENDED && activeItem?.id == item.id) advancePlaylist()
                }

                override fun onPlayerError(error: PlaybackException) {
                    if (activeItem?.id != item.id) return
                    playbackState = "video-error"
                    videoStatusView.visibility = View.VISIBLE
                    videoStatusView.text = "Không thể phát video · chuyển nội dung tiếp theo"
                    scheduleAdvance(3)
                }
            })
            created.setMediaItem(MediaItem.fromUri(uri))
            created.prepare()
            created.playWhenReady = true
        }
        exoPlayer = player
        playerView.player = player
        scheduleAdvance(item.durationSeconds)
    }

    private fun hideContentViews() {
        recognitionView.visibility = View.GONE
        videoView.visibility = View.GONE
        announcementView.visibility = View.GONE
    }

    private fun showSlideArtwork(item: PlaylistItem) {
        val bundledBackground = recognitionBackgroundResource(item)
        if (item.backgroundUrl.isNullOrBlank() && bundledBackground != 0) {
            showBundledArtwork(slideBackgroundView, bundledBackground, 0.46f)
        } else {
            loadSlideArtwork(
                item = item,
                url = item.backgroundUrl,
                sha256 = item.backgroundSha256,
                target = slideBackgroundView,
                targetAlpha = 0.46f,
                maxBitmapEdge = 2_048
            )
        }

        val bundledLogo = recognitionBadgeResource(item).takeIf { it != 0 }
            ?: R.drawable.unite_group_logo
        if (item.logoUrl.isNullOrBlank()) {
            showBundledArtwork(slideLogoView, bundledLogo, 1f)
        } else {
            loadSlideArtwork(
                item = item,
                url = item.logoUrl,
                sha256 = item.logoSha256,
                target = slideLogoView,
                targetAlpha = 1f,
                maxBitmapEdge = 768
            )
        }
    }

    private fun showBundledArtwork(target: ImageView, drawableId: Int, targetAlpha: Float) {
        target.animate().cancel()
        target.tag = "$DEFAULT_LOGO_TAG:$drawableId"
        target.setImageResource(drawableId)
        target.alpha = 0f
        target.visibility = View.VISIBLE
        target.animate().alpha(targetAlpha).setDuration(ARTWORK_FADE_MS).start()
    }

    private fun recognitionBackgroundResource(item: PlaylistItem): Int {
        if (item.type != PlaylistItemType.RECOGNITION) return 0
        val key = recognitionVisualKey(item)
        return when {
            key.contains("DAI TUONG") ||
                key.contains("TUONG QUAN") ||
                key.contains("PHUONG HOANG") -> R.drawable.recognition_background_gold
            key.contains("THU LINH") ||
                key.contains("SU TU") -> R.drawable.recognition_background_blue
            else -> R.drawable.recognition_background_red
        }
    }

    private fun recognitionBadgeResource(item: PlaylistItem): Int {
        if (item.type != PlaylistItemType.RECOGNITION) return 0
        val key = recognitionVisualKey(item)
        return when {
            key.contains("THONG SOAI") -> R.drawable.recognition_badge_thong_soai
            key.contains("DAI TUONG") ||
                key.contains("TUONG QUAN") -> R.drawable.recognition_badge_tuong_quan
            key.contains("THU LINH") -> R.drawable.recognition_badge_thu_linh
            key.contains("KY LAN") -> R.drawable.recognition_badge_ky_lan
            key.contains("PHUONG HOANG") -> R.drawable.recognition_badge_phuong_hoang
            key.contains("SU TU") -> R.drawable.recognition_badge_su_tu
            else -> 0
        }
    }

    private fun recognitionVisualKey(item: PlaylistItem): String {
        val raw = "${item.title} ${item.recognitionBoard?.categoryLabel.orEmpty()}"
            .replace('Đ', 'D')
            .replace('đ', 'd')
        return Normalizer.normalize(raw, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .uppercase(Locale.ROOT)
    }

    private fun loadSlideArtwork(
        item: PlaylistItem,
        url: String?,
        sha256: String?,
        target: ImageView,
        targetAlpha: Float,
        maxBitmapEdge: Int
    ) {
        target.animate().cancel()
        target.setImageDrawable(null)
        target.alpha = 0f
        target.visibility = View.GONE
        if (url.isNullOrBlank()) {
            target.tag = null
            return
        }

        val requestTag = "${activeRelease?.id}:${item.id}:$url"
        target.tag = requestTag
        mediaCache.resolve(url, sha256) { resolution ->
            val bitmap = (resolution as? MediaResolution.Ready)
                ?.file
                ?.let { decodeArtwork(it, maxBitmapEdge) }
            runOnUiThread {
                if (
                    destroyed.get() ||
                    activeItem?.id != item.id ||
                    target.tag != requestTag
                ) {
                    return@runOnUiThread
                }
                if (bitmap == null) {
                    target.visibility = View.GONE
                    return@runOnUiThread
                }
                target.setImageBitmap(bitmap)
                target.visibility = View.VISIBLE
                target.animate().alpha(targetAlpha).setDuration(ARTWORK_FADE_MS).start()
            }
        }
    }

    private fun decodeArtwork(file: File, maxEdge: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sampleSize = 1
        while (
            bounds.outWidth / sampleSize > maxEdge ||
            bounds.outHeight / sampleSize > maxEdge
        ) {
            sampleSize *= 2
        }
        return BitmapFactory.decodeFile(
            file.absolutePath,
            BitmapFactory.Options().apply { inSampleSize = sampleSize }
        )
    }

    private fun scheduleAdvance(seconds: Int) {
        mainHandler.removeCallbacks(advanceRunnable)
        mainHandler.postDelayed(advanceRunnable, seconds.coerceAtLeast(3) * 1_000L)
    }

    private fun advancePlaylist() {
        val size = activeRelease?.playlist?.size ?: return
        if (size == 0) return
        activeIndex = (activeIndex + 1) % size
        playCurrentItem()
    }

    private fun releaseMediaPlayer() {
        playerView.player = null
        exoPlayer?.release()
        exoPlayer = null
    }

    private fun heartbeatSnapshot(): PlaybackSnapshot {
        val config = activeConfig
        val release = activeRelease
        return PlaybackSnapshot(
            deviceId = config?.deviceId.orEmpty(),
            branchId = config?.branchId.orEmpty(),
            releaseId = release?.id,
            readyReleaseId = pendingRelease?.takeIf { pendingReleaseReady }?.id,
            releaseVersion = release?.version,
            playlistItemId = activeItem?.id,
            playbackState = playbackState,
            cacheState = cacheState,
            appVersion = BuildConfig.VERSION_NAME
        )
    }

    @Suppress("DEPRECATION")
    private fun enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    override fun onDestroy() {
        destroyed.set(true)
        mainHandler.removeCallbacksAndMessages(null)
        releaseMediaPlayer()
        heartbeatScheduler?.close()
        broadcast.close()
        recognitionRenderer.close()
        mediaCache.close()
        backend.close()
        super.onDestroy()
    }

    private companion object {
        const val DEFAULT_LOGO_TAG = "default-unite-logo"
        const val ARTWORK_FADE_MS = 450L
        const val RELEASE_REFRESH_MS = 60_000L
        const val PAIRING_POLL_MS = 5_000L
        const val MAX_SCHEDULE_DELAY_MS = 24L * 60L * 60L * 1_000L
    }
}
