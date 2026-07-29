import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Crown,
  Maximize2,
  Medal,
  Megaphone,
  MonitorSmartphone,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { Brand } from '../components/Brand'
import { getRecognitionVisualPreset } from '../data/recognitionPresets'
import { formatClock, formatFullDate, formatVnd } from '../lib/format'
import { honoreeContextLabel } from '../lib/honoreeDisplay'
import {
  isWithinSchedule,
  normalizePlaylistItem,
} from '../lib/playlistConfig'
import { useMediaAssetUrl } from '../lib/mediaStore'
import { getPublicShareManifest, PublicShareClientError } from '../lib/publicShareClient'
import { playlistConfigFromReleaseManifest } from '../lib/releaseManifest'
import {
  WebScreenClientError,
  getWebScreenCredentials,
  getWebScreenManifest,
  getWebScreenStatus,
  isWebScreenClientConfigured,
  registerWebScreen,
  resetWebScreenCredentials,
  sendWebScreenHeartbeat,
  type WebScreen,
  type WebScreenRelease,
} from '../lib/webScreenClient'
import type { Board, PlaylistConfig, PlaylistDraftItem } from '../types'
import {
  isPlayerItemAllowed,
  prioritizePlayerSlides,
  shouldApplyAudienceAndSchedule,
  toPublishedPlayerSlide,
  type PlayerMode,
} from './playerPolicy'

type PlayerSlide = PlaylistDraftItem & { board?: Board }

const MAX_TIMER_DELAY_MS = 2_147_000_000
const brandAsset = (fileName: string) => `${import.meta.env.BASE_URL}brand/${fileName}`
const VIDEO_POSTER_URL = brandAsset('mascot-wide.png')
const EVENT_MASCOT_URL = brandAsset('mascot-suit-red.png')
const ANNOUNCEMENT_MASCOT_URL = brandAsset('mascot-female.png')

const standbyItem: PlayerSlide = {
  ...normalizePlaylistItem({
    id: 'standby',
    title: 'Dữ liệu phát hành',
    kind: 'announcement',
    meta: 'Đang tải dữ liệu thật',
    duration: 30,
    enabled: true,
    audience: 'Màn hình hiện tại',
  }),
  headline: 'ĐANG TẢI BẢN VINH DANH',
  subtitle: 'Dữ liệu thật đang được lấy từ bản phát hành mới nhất',
  body: '',
  showHeader: true,
  showFooter: true,
}

const readHashParams = () => {
  const query = window.location.hash.split('?')[1] || ''
  return new URLSearchParams(query)
}

const normalizedBranchAliases = (...values: Array<string | null | undefined>) => {
  const aliases = new Set<string>()
  for (const rawValue of values) {
    const value = rawValue?.trim().toUpperCase()
    if (!value) continue
    aliases.add(value)
    const numbered = value.match(/^(?:BR|CN)-?0*(\d+)$/)
    if (!numbered) continue
    const number = numbered[1].padStart(2, '0')
    aliases.add(`BR-${number}`)
    aliases.add(`CN${number}`)
  }
  return aliases
}

const targetsActiveBranch = (
  branchIds: string[],
  activeBranch: { id: string; code: string },
  remoteScreen: WebScreen | null,
) => {
  if (branchIds.length === 0) return true
  const aliases = normalizedBranchAliases(
    activeBranch.id,
    activeBranch.code,
    remoteScreen?.branchId,
    remoteScreen?.branch?.id,
    remoteScreen?.branch?.code,
  )
  return branchIds.some((branchId) => aliases.has(branchId.trim().toUpperCase()))
}

const releasePeriodLabel = (release: WebScreenRelease) => {
  const value = release.manifest.period_label
  return typeof value === 'string' && value.trim() ? value.trim() : release.releaseVersion
}

const waitingConfig: PlaylistConfig = {
  version: 1,
  name: 'Đang tải bản vinh danh',
  items: [standbyItem],
  schedule: {
    enabled: false,
    startDate: '',
    endDate: '',
    dailyStart: '00:00',
    dailyEnd: '23:59',
    weekdays: [1, 2, 3, 4, 5, 6, 0],
  },
  repeat: true,
  updatedAt: new Date(0).toISOString(),
}

const fallbackBranch = (branchId: string | null) => {
  const id = branchId?.trim() || 'global'
  const match = id.toUpperCase().match(/^(?:BR|CN)-?0*(\d+)$/)
  return {
    id,
    code: match ? `CN${match[1].padStart(2, '0')}` : 'GLOBAL',
    name: 'Toàn hệ thống',
    address: 'Toàn hệ thống',
    release: 'CHƯA NHẬN BẢN',
    pilot: false,
  }
}

export function ScreenPlayer({ mode = 'paired' }: { mode?: PlayerMode }) {
  const params = useMemo(readHashParams, [])
  const preferredItem = params.get('item')
  const preferredBoard = params.get('board')
  const preferredBranch = params.get('branch')
  const publicTv = mode === 'public'
  const pairedTvEnabled = !publicTv && isWebScreenClientConfigured()
  const requestedBranch = useMemo(() => fallbackBranch(preferredBranch), [preferredBranch])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [now, setNow] = useState(new Date())
  const [controls, setControls] = useState(true)
  const [remoteConfig, setRemoteConfig] = useState<PlaylistConfig | null>(null)
  const [remoteScreen, setRemoteScreen] = useState<WebScreen | null>(null)
  const [connectionPhase, setConnectionPhase] = useState<'loading' | 'registering' | 'pending' | 'approved' | 'error'>(
    publicTv ? 'loading' : pairedTvEnabled ? 'registering' : 'error',
  )
  const [pairingCode, setPairingCode] = useState('')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [currentReleaseId, setCurrentReleaseId] = useState<string | null>(null)
  const [currentReleaseVersion, setCurrentReleaseVersion] = useState<string | null>(null)
  const [currentReleasePeriod, setCurrentReleasePeriod] = useState<string | null>(null)
  const [readyReleaseId, setReadyReleaseId] = useState<string | null>(null)
  const [readyReleaseVersion, setReadyReleaseVersion] = useState<string | null>(null)
  const [pairingAttempt, setPairingAttempt] = useState(0)
  const [publicRefreshAttempt, setPublicRefreshAttempt] = useState(0)
  const config = remoteConfig ?? waitingConfig
  const activeBranch = useMemo(() => {
    if (!remoteScreen?.branch) return requestedBranch
    return {
      ...requestedBranch,
      id: remoteScreen.branch.id,
      code: remoteScreen.branch.code,
      name: remoteScreen.branch.name,
      address: remoteScreen.branch.address,
    }
  }, [remoteScreen, requestedBranch])

  useEffect(() => {
    if (!publicTv) return
    let disposed = false
    let refreshTimer: number | undefined
    let requestController: AbortController | undefined
    let hasPlayableRelease = Boolean(remoteConfig)

    const refresh = async () => {
      setConnectionMessage((current) => current || 'Đang tải bản phát hành mới nhất…')
      requestController = new AbortController()
      const requestTimeout = window.setTimeout(() => requestController?.abort(), 15_000)
      try {
        const result = await getPublicShareManifest(requestController.signal)
        if (disposed) return
        if (!result.release) {
          setConnectionPhase(hasPlayableRelease ? 'approved' : 'error')
          setConnectionMessage(hasPlayableRelease
            ? 'Đang tiếp tục phát bản gần nhất đã nhận.'
            : 'Chưa có bản dữ liệu thật nào được phát hành cho toàn hệ thống.')
        } else {
          const nextConfig = playlistConfigFromReleaseManifest(result.release.manifest)
          if (!nextConfig) {
            throw new PublicShareClientError(
              'INVALID_RESPONSE',
              'Bản phát hành mới nhất không chứa cấu hình TV hợp lệ.',
            )
          }
          if (!nextConfig.items.some((item) => item.kind === 'recognition' && item.recognitionBoard)) {
            throw new PublicShareClientError(
              'NO_RECOGNITION_DATA',
              'Bản phát hành mới nhất chưa có bảng vinh danh thật để trình chiếu.',
            )
          }
          setRemoteConfig(nextConfig)
          hasPlayableRelease = true
          setCurrentReleaseId(result.release.id)
          setCurrentReleaseVersion(result.release.releaseVersion)
          setCurrentReleasePeriod(releasePeriodLabel(result.release))
          setReadyReleaseId(null)
          setReadyReleaseVersion(null)
          setConnectionPhase('approved')
          setConnectionMessage(
            result.fromCache
              ? `Đang phát ${result.release.releaseVersion} · bản gần nhất đã lưu`
              : `Đang phát ${result.release.releaseVersion} · dữ liệu đã phát hành`,
          )
        }
      } catch (error) {
        if (disposed) return
        setConnectionPhase(hasPlayableRelease ? 'approved' : 'error')
        setConnectionMessage(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Máy chủ phản hồi quá lâu. TV sẽ tự thử lại sau một phút.'
            : error instanceof Error
            ? error.message
            : 'Không thể tải bản vinh danh đã phát hành.',
        )
      } finally {
        window.clearTimeout(requestTimeout)
        requestController = undefined
        if (!disposed) refreshTimer = window.setTimeout(() => void refresh(), 60_000)
      }
    }

    void refresh()
    return () => {
      disposed = true
      requestController?.abort()
      if (refreshTimer) window.clearTimeout(refreshTimer)
    }
  }, [publicRefreshAttempt, publicTv])

  useEffect(() => {
    if (!pairedTvEnabled) return
    let disposed = false
    let statusTimer: number | undefined
    let manifestTimer: number | undefined
    let activationTimer: number | undefined

    const fail = (error: unknown, retry: () => void) => {
      if (disposed) return
      const message = error instanceof Error ? error.message : 'Không thể kết nối Web TV.'
      setConnectionPhase('error')
      setConnectionMessage(message)
      if (error instanceof WebScreenClientError && error.retriable) {
        statusTimer = window.setTimeout(retry, 10_000)
      }
    }

    const refreshManifest = async () => {
      try {
        const result = await getWebScreenManifest()
        if (disposed) return
        if (result.screen) setRemoteScreen(result.screen)
        if (activationTimer) {
          window.clearTimeout(activationTimer)
          activationTimer = undefined
        }
        if (!result.release) {
          setReadyReleaseId(null)
          setReadyReleaseVersion(null)
          setConnectionMessage('Đã ghép TV · đang chờ Admin phát hành nội dung.')
        } else {
          const nextConfig = playlistConfigFromReleaseManifest(result.release.manifest)
          if (!nextConfig) {
            throw new WebScreenClientError(
              'INVALID_RESPONSE',
              'Bản phát hành không chứa cấu hình Web TV hợp lệ.',
            )
          }
          const activateRelease = (release: WebScreenRelease, releaseConfig: PlaylistConfig) => {
            if (disposed) return
            setRemoteConfig(releaseConfig)
            setCurrentReleaseId(release.id)
            setCurrentReleaseVersion(release.releaseVersion)
            setCurrentReleasePeriod(releasePeriodLabel(release))
            setReadyReleaseId(null)
            setReadyReleaseVersion(null)
            setConnectionMessage(`Đã nhận ${release.releaseVersion}`)
          }
          const scheduleActivation = (
            release: WebScreenRelease,
            releaseConfig: PlaylistConfig,
            remainingDelay: number,
          ) => {
            const timerDelay = Math.min(remainingDelay, MAX_TIMER_DELAY_MS)
            activationTimer = window.setTimeout(() => {
              if (remainingDelay > MAX_TIMER_DELAY_MS) {
                scheduleActivation(release, releaseConfig, remainingDelay - MAX_TIMER_DELAY_MS)
                return
              }
              activateRelease(release, releaseConfig)
            }, timerDelay)
          }
          const serverTime = Date.parse(result.serverTime)
          const activateAt = result.release.activateAt
            ? Date.parse(result.release.activateAt)
            : serverTime
          if (!Number.isFinite(serverTime) || !Number.isFinite(activateAt)) {
            throw new WebScreenClientError(
              'INVALID_RESPONSE',
              'Thời điểm kích hoạt bản phát hành không hợp lệ.',
            )
          }
          const activationDelay = activateAt - serverTime
          if (activationDelay > 0) {
            setReadyReleaseId(result.release.id)
            setReadyReleaseVersion(result.release.releaseVersion)
            setConnectionMessage(`Đã tải ${result.release.releaseVersion} · chờ giờ kích hoạt`)
            scheduleActivation(result.release, nextConfig, activationDelay)
          } else {
            activateRelease(result.release, nextConfig)
          }
        }
        manifestTimer = window.setTimeout(() => void refreshManifest(), 60_000)
      } catch (error) {
        fail(error, () => void refreshManifest())
      }
    }

    const checkStatus = async () => {
      try {
        const credentials = getWebScreenCredentials()
        if (!credentials.deviceToken) {
          setConnectionPhase('registering')
          setConnectionMessage('Đang tạo mã ghép nối…')
          const registration = await registerWebScreen({
            deviceName: `Web TV · ${navigator.userAgent.includes('Android') ? 'Android' : 'Browser'}`,
          })
          if (disposed) return
          setPairingCode(registration.pairingCode)
        } else if (credentials.pairingCode) {
          setPairingCode(credentials.pairingCode)
        }

        const status = await getWebScreenStatus()
        if (disposed) return
        if (status.status === 'approved' && status.screen) {
          setRemoteScreen(status.screen)
          setConnectionPhase('approved')
          setConnectionMessage('Đã ghép nối · đang tải bản phát hành.')
          await refreshManifest()
          return
        }
        if (status.status === 'pending') {
          setConnectionPhase('pending')
          setConnectionMessage('Nhập mã này tại Admin → Thiết bị TV → Ghép nối TV.')
          statusTimer = window.setTimeout(() => void checkStatus(), 5_000)
          return
        }
        throw new WebScreenClientError(
          status.status === 'expired' ? 'PAIRING_EXPIRED' : 'DEVICE_REVOKED',
          status.status === 'expired'
            ? 'Mã ghép nối đã hết hạn. Hãy tạo mã mới.'
            : 'Thiết bị đã bị thu hồi. Hãy ghép nối lại.',
        )
      } catch (error) {
        fail(error, () => void checkStatus())
      }
    }

    void checkStatus()
    return () => {
      disposed = true
      if (statusTimer) window.clearTimeout(statusTimer)
      if (manifestTimer) window.clearTimeout(manifestTimer)
      if (activationTimer) window.clearTimeout(activationTimer)
    }
  }, [pairedTvEnabled, pairingAttempt])

  const slides = useMemo(() => {
    const enforceAudienceAndSchedule = shouldApplyAudienceAndSchedule(mode)
    const active = config.items
      .filter((item) => item.enabled)
      .filter((item) => isPlayerItemAllowed(mode, item.kind))
      .filter((item) => !enforceAudienceAndSchedule || targetsActiveBranch(item.branchIds, activeBranch, remoteScreen))
      .filter((item) => !enforceAudienceAndSchedule || isWithinSchedule(item.schedule?.enabled ? item.schedule : config.schedule, now))
      .map(toPublishedPlayerSlide)
      .filter((item): item is PlayerSlide => Boolean(item))
    const prioritized = prioritizePlayerSlides(active, preferredItem, preferredBoard, mode)
    return prioritized.length ? prioritized : [{ ...standbyItem }]
  }, [activeBranch, config.items, config.schedule, mode, now, preferredBoard, preferredItem, remoteScreen])

  useEffect(() => {
    if (index >= slides.length) setIndex(0)
  }, [index, slides.length])

  const slide = slides[Math.min(index, slides.length - 1)]
  const uploadedBackgroundUrl = useMediaAssetUrl(slide.backgroundAssetId)
  const uploadedLogoUrl = useMediaAssetUrl(slide.logoAssetId)
  const storedMediaUrl = useMediaAssetUrl(slide.mediaAssetId)
  const recognitionPreset = slide.kind === 'recognition'
    ? getRecognitionVisualPreset(slide.boardId)
    : undefined
  const backgroundUrl = uploadedBackgroundUrl || slide.backgroundUrl || recognitionPreset?.backgroundUrl || ''
  const logoUrl = uploadedLogoUrl || slide.logoUrl || ''
  const resolvedVideoUrl = storedMediaUrl
    || slide.mediaUrl
  const displayedRelease = currentReleaseVersion ?? 'CHƯA NHẬN BẢN'

  useEffect(() => {
    if (!pairedTvEnabled || connectionPhase !== 'approved') return
    let disposed = false
    const heartbeat = async () => {
      try {
        await sendWebScreenHeartbeat({
          currentReleaseId,
          readyReleaseId,
          currentItemKey: slide.id,
          appVersion: 'web-mvp',
          cacheState: {
            mode: 'remote-release',
            releaseVersion: currentReleaseVersion,
            readyReleaseVersion,
          },
          deviceInfo: {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            online: navigator.onLine,
          },
        })
        if (!disposed) {
          setOnline(true)
          setConnectionMessage(
            readyReleaseVersion
              ? `Đã tải ${readyReleaseVersion} · chờ giờ kích hoạt`
              : currentReleaseVersion
                ? `Đã nhận ${currentReleaseVersion}`
                : 'Đã ghép · chờ phát hành',
          )
        }
      } catch (error) {
        if (!disposed) {
          setConnectionMessage(error instanceof Error ? error.message : 'Heartbeat Web TV thất bại.')
        }
      }
    }
    void heartbeat()
    const timer = window.setInterval(() => void heartbeat(), 30_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [
    connectionPhase,
    currentReleaseId,
    currentReleaseVersion,
    readyReleaseId,
    readyReleaseVersion,
    remoteConfig,
    slide.id,
    pairedTvEnabled,
  ])

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => {
      setIndex((current) => {
        if (current >= slides.length - 1) {
          if (!config.repeat) {
            setPaused(true)
            return current
          }
          return 0
        }
        return current + 1
      })
    }, slide.duration * 1000)
    return () => window.clearTimeout(timer)
  }, [config.repeat, index, paused, slide.duration, slide.id, slides.length])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.clearInterval(clock)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    const hide = window.setTimeout(() => setControls(false), 4200)
    return () => window.clearTimeout(hide)
  }, [index, controls])

  const next = () => setIndex((current) => current >= slides.length - 1 ? config.repeat ? 0 : current : current + 1)
  const previous = () => setIndex((current) => current <= 0 ? config.repeat ? slides.length - 1 : 0 : current - 1)
  const fullscreen = () => document.documentElement.requestFullscreen?.()
  const restartPairing = () => {
    resetWebScreenCredentials(false)
    setPairingCode('')
    setRemoteConfig(null)
    setRemoteScreen(null)
    setCurrentReleaseId(null)
    setCurrentReleaseVersion(null)
    setCurrentReleasePeriod(null)
    setReadyReleaseId(null)
    setReadyReleaseVersion(null)
    setConnectionPhase('registering')
    setConnectionMessage('Đang tạo mã ghép nối mới…')
    setPairingAttempt((value) => value + 1)
  }
  const refreshPublicTv = () => {
    setConnectionPhase(remoteConfig ? 'approved' : 'loading')
    setConnectionMessage('Đang kiểm tra bản phát hành mới nhất…')
    setPublicRefreshAttempt((value) => value + 1)
  }

  const backgroundStyle: CSSProperties = {
    backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : undefined,
    backgroundSize: slide.backgroundFit,
    backgroundPosition: slide.backgroundPosition,
  }

  return (
    <div
      className={`screen-player screen-player--${slide.kind} ${!slide.showHeader ? 'screen-player--no-header' : ''} ${!slide.showFooter ? 'screen-player--no-footer' : ''}`}
      onMouseMove={() => setControls(true)}
    >
      <div className="screen-noise" />
      <div className="screen-grid" />
      {slide.showHeader && (
        <header className="screen-header">
          <Brand inverse />
          <div className="screen-header__center"><span><Radio size={14} /> {remoteConfig ? `VINH DANH · ${(currentReleasePeriod || displayedRelease).toUpperCase()}` : 'VINH DANH · ĐANG TẢI DỮ LIỆU THẬT'}</span><i /></div>
          <div className="screen-clock"><div><strong>{formatClock(now)}</strong><span>{formatFullDate(now)}</span></div><span className={online ? 'online' : 'offline'}>{online ? <Wifi size={16} /> : <WifiOff size={16} />}{connectionPhase === 'approved' ? connectionMessage : online ? 'Đang kết nối dữ liệu' : 'Đang phát bản đã lưu'}</span></div>
        </header>
      )}

      <main
        className={`screen-stage screen-stage--transition-${slide.transition}`}
        key={`${slide.id}-${index}`}
        style={{ '--slide-transition-duration': `${slide.transitionDuration}s` } as CSSProperties}
      >
        {backgroundUrl && <div className="screen-stage__background" style={backgroundStyle} />}
        {backgroundUrl && <div className="screen-stage__overlay" style={{ background: `rgba(3,5,8,${slide.overlayOpacity / 100})` }} />}
        {slide.logoMode === 'default' && recognitionPreset?.badgeUrl && (
          <div
            className={`recognition-power-badge recognition-power-badge--${slide.logoEffect} screen-stage__custom-logo--${slide.logoPosition}`}
            style={{ '--custom-logo-scale': slide.logoScale / 100 } as CSSProperties}
            aria-label={`Huy hiệu ${recognitionPreset.badgeLabel ?? slide.headline}`}
          >
            <span className="recognition-power-badge__aura" />
            <span className="recognition-power-badge__ring" />
            <img src={recognitionPreset.badgeUrl} alt="" />
            <span className="recognition-power-badge__shine" />
          </div>
        )}
        {slide.logoMode === 'custom' && logoUrl && (
          <img
            className={`screen-stage__custom-logo screen-stage__custom-logo--${slide.logoPosition} screen-stage__custom-logo--effect-${slide.logoEffect}`}
            src={logoUrl}
            alt=""
            style={{ '--custom-logo-scale': slide.logoScale / 100 } as CSSProperties}
          />
        )}
        {slide.logoMode === 'default' && !recognitionPreset?.badgeUrl && !slide.showHeader && (
          <div className={`screen-stage__default-logo screen-stage__custom-logo--${slide.logoPosition}`} style={{ '--custom-logo-scale': slide.logoScale / 100 } as CSSProperties}><Brand inverse /></div>
        )}
        <div className="screen-stage__content">
          {slide.kind === 'recognition' && slide.board && <RecognitionSlide board={slide.board} />}
          {slide.kind === 'video' && <VideoSlide title={slide.headline} subtitle={slide.subtitle} videoUrl={resolvedVideoUrl} muted={muted || !slide.audioEnabled} onMutedChange={setMuted} />}
          {slide.kind === 'event' && <EventSlide item={slide} />}
          {slide.kind === 'announcement' && <AnnouncementSlide item={slide} showMascot={slide.id !== standbyItem.id} />}
        </div>
      </main>

      {slide.showFooter && (
        <footer className="screen-footer">
          <div className="screen-footer__branch"><MonitorSmartphone size={15} /><span>{publicTv ? 'TOÀN HỆ THỐNG · LINK TV' : activeBranch.address.toUpperCase()}</span><i />{displayedRelease}</div>
          <div className="screen-progress-dots">{slides.map((item, position) => <button key={item.id} className={position === index ? 'active' : ''} onClick={() => setIndex(position)} aria-label={`Đến slide ${position + 1}`} />)}</div>
          <div className="screen-footer__now"><span>{index + 1}/{slides.length}</span><strong>{slide.headline}</strong></div>
        </footer>
      )}

      <div className={`screen-controls ${controls ? 'visible' : ''}`}>
        <button onClick={publicTv ? refreshPublicTv : () => { window.location.hash = '/admin/playlist' }} title={publicTv ? 'Tải dữ liệu mới nhất' : 'Về Admin'}><RotateCcw size={19} /></button>
        <button onClick={previous} title="Nội dung trước"><ChevronLeft size={22} /></button>
        <button className="screen-controls__primary" onClick={() => setPaused((value) => !value)} title={paused ? 'Tiếp tục' : 'Tạm dừng'}>{paused ? <Play size={22} /> : <Pause size={22} />}</button>
        <button onClick={next} title="Nội dung sau"><ChevronRight size={22} /></button>
        <button onClick={() => setMuted((value) => !value)} title={muted ? 'Bật tiếng' : 'Tắt tiếng'}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
        <button onClick={fullscreen} title="Toàn màn hình"><Maximize2 size={19} /></button>
      </div>

      <div key={`progress-${index}-${paused}-${slide.duration}`} className={`screen-progress ${paused ? 'paused' : ''}`}><span style={{ '--slide-duration': `${slide.duration}s` } as CSSProperties} /></div>
      {!online && <div className="offline-banner"><WifiOff size={16} /> Mất kết nối · TV vẫn phát bản {displayedRelease} đã lưu trên thiết bị</div>}
      {pairedTvEnabled && connectionPhase !== 'approved' && (
        <section className={`web-tv-pairing web-tv-pairing--${connectionPhase}`}>
          <Brand inverse />
          <div className="web-tv-pairing__card">
            <span><MonitorSmartphone size={22} /> WEB TV · GHÉP NỐI SUPABASE</span>
            <h2>
              {connectionPhase === 'pending'
                ? 'NHẬP MÃ NÀY TRÊN ADMIN'
                : connectionPhase === 'error'
                  ? 'CHƯA KẾT NỐI ĐƯỢC'
                  : 'ĐANG KHỞI TẠO WEB TV'}
            </h2>
            {pairingCode && (
              <strong className="web-tv-pairing__code">
                {pairingCode.replace(/(\d{3})(\d{3})/, '$1 $2')}
              </strong>
            )}
            <p>{connectionMessage || 'Vui lòng chờ trong giây lát…'}</p>
            <small>Player chỉ phát bản thật đã xuất bản; không dùng dữ liệu mẫu để thay thế.</small>
            {connectionPhase === 'error' && (
              <button onClick={restartPairing}><RotateCcw size={17} /> Tạo mã ghép nối mới</button>
            )}
          </div>
        </section>
      )}
      {publicTv && connectionPhase !== 'approved' && (
        <section className={`web-tv-pairing web-tv-pairing--${connectionPhase}`}>
          <Brand inverse />
          <div className="web-tv-pairing__card">
            <span><MonitorSmartphone size={22} /> TV TRỰC TUYẾN · DỮ LIỆU ĐÃ PHÁT HÀNH</span>
            <h2>{connectionPhase === 'error' ? 'CHƯA CÓ BẢN ĐỂ PHÁT' : 'ĐANG TẢI VINH DANH'}</h2>
            <p>{connectionMessage || 'Vui lòng chờ trong giây lát…'}</p>
            <small>Link này không cần ghép nối và không bao giờ hiển thị dữ liệu demo.</small>
            {connectionPhase === 'error' && (
              <button onClick={refreshPublicTv}><RotateCcw size={17} /> Kiểm tra lại ngay</button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function RecognitionSlide({ board }: { board: Board }) {
  const top = board.honorees.slice(0, 3)
  const hasRanking = board.honorees.length > 3
  return (
    <section className={`recognition-slide ${hasRanking ? '' : 'recognition-slide--top-only'}`}>
      <div className="recognition-title"><div className="recognition-title__icon"><Trophy size={20} /></div><p>{board.subtitle}</p><h1>{board.title}</h1><span>{board.threshold}</span></div>
      <div className="recognition-content">
        <div className="tv-podium">
          {[top[1], top[0], top[2]].filter(Boolean).map((person, visualIndex) => (
            <article className={`tv-winner tv-winner--${person.rank}`} key={`${person.rank}-${person.name}-${person.branch}`} style={{ '--winner-delay': `${visualIndex * 0.12}s` } as CSSProperties}>
              <div className="tv-winner__halo" />
              <span className="tv-winner__medal">{person.rank === 1 ? <Crown /> : <Medal />}<b>{person.rank}</b></span>
              <Avatar person={person} size="xl" glow={person.rank === 1} presentation="cutout" />
              <i>HẠNG {person.rank}</i>
              <h2>{person.shortName}</h2>
              <p>{honoreeContextLabel(board.group, person)}</p>
              <strong>{formatVnd(person.revenue)}</strong>
              <div className="tv-winner__base"><span>{person.rank}</span></div>
            </article>
          ))}
        </div>
        {hasRanking && <div className="tv-ranking"><div className="tv-ranking__head"><span>TOP 10 XUẤT SẮC</span><i>DOANH SỐ</i></div>{board.honorees.slice(3, 10).map((person, listIndex) => <div className="tv-ranking__row" key={person.rank} style={{ '--row-delay': `${0.34 + listIndex * 0.055}s` } as CSSProperties}><span>{String(person.rank).padStart(2, '0')}</span><Avatar person={person} size="sm" /><p><strong>{person.shortName}</strong><small>{honoreeContextLabel(board.group, person)}</small></p><b>{formatVnd(person.revenue)}</b></div>)}</div>}
      </div>
      <p className="recognition-caption"><Sparkles size={15} /> Thành tích hôm nay là cảm hứng cho hành trình ngày mai</p>
    </section>
  )
}

function VideoSlide({
  title,
  subtitle,
  videoUrl,
  muted,
  onMutedChange,
}: {
  title: string
  subtitle: string
  videoUrl: string
  muted: boolean
  onMutedChange: (muted: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const hasVideo = Boolean(videoUrl && !videoFailed)

  useEffect(() => {
    setVideoFailed(false)
  }, [videoUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !hasVideo) return
    video.muted = muted
    const attempt = video.play()
    attempt?.then(() => setNeedsGesture(false)).catch((error: DOMException) => {
      if (error.name === 'NotAllowedError') setNeedsGesture(true)
      else setVideoFailed(true)
    })
  }, [hasVideo, muted, videoUrl])

  const startWithAudio = async () => {
    const video = videoRef.current
    if (!video) return
    onMutedChange(false)
    video.muted = false
    try {
      await video.play()
      setNeedsGesture(false)
    } catch {
      setVideoFailed(true)
      setNeedsGesture(false)
    }
  }

  return (
    <section className={`video-slide ${hasVideo ? 'video-slide--media' : ''}`}>
      {hasVideo ? (
        <>
          <video ref={videoRef} className="video-slide__video" src={videoUrl} poster={VIDEO_POSTER_URL} autoPlay loop muted={muted} playsInline preload="auto" onError={() => setVideoFailed(true)} />
          <div className="video-slide__video-shade" />
        </>
      ) : (
        <>
          <div className="video-slide__rings"><i /><i /><i /></div>
          <div className="video-slide__mark"><CirclePlay size={82} /></div>
        </>
      )}
      <p>TRUYỀN THÔNG NỘI BỘ</p><h1>{title}</h1><h2>{subtitle}</h2>
      <div className="video-slide__meta"><span><Radio size={15} /> {hasVideo ? 'ĐANG PHÁT VIDEO' : 'CHƯA CHỌN VIDEO'}</span><span>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}{muted ? 'Đã tắt âm thanh' : 'Âm thanh đang bật'}</span><span>1080P · H.264</span></div>
      <div className="equalizer" aria-hidden="true">{Array.from({ length: 24 }, (_, itemIndex) => <i key={itemIndex} style={{ '--eq-index': itemIndex } as CSSProperties} />)}</div>
      {needsGesture && (
        <div className="video-audio-gate">
          <button onClick={startWithAudio}><CirclePlay size={24} /><span>Bắt đầu trình chiếu có âm thanh</span><small>Trình duyệt cần một lần xác nhận trên thiết bị này</small></button>
        </div>
      )}
    </section>
  )
}

function EventSlide({ item }: { item: PlaylistDraftItem }) {
  const date = item.eventDate ? new Date(`${item.eventDate}T12:00:00`) : new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(date).toUpperCase()
  return (
    <section className="event-slide">
      <div className="event-slide__date"><span>THÁNG {month}</span><strong>{day}</strong><small>{weekday} · {item.eventTime}</small></div>
      <div className="event-slide__copy"><p><CalendarDays size={18} /> SỰ KIỆN SẮP DIỄN RA</p><h1>{item.headline}</h1><h2>{item.subtitle}</h2><div><span>{item.location}</span></div></div>
      <div className="event-slide__mascot"><span /><img src={EVENT_MASCOT_URL} alt="" /></div>
    </section>
  )
}

function AnnouncementSlide({ item, showMascot = true }: { item: PlaylistDraftItem; showMascot?: boolean }) {
  const tasks = item.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 6)
  return (
    <section className="announcement-slide">
      {showMascot && <img className="announcement-slide__mascot" src={ANNOUNCEMENT_MASCOT_URL} alt="" />}
      <div className="announcement-slide__icon"><Megaphone size={55} /></div>
      <p>{item.title.toUpperCase()}</p><h1>{item.headline}</h1><h2>{item.subtitle}</h2>
      {tasks.length > 0 && <div className={`announcement-tasks announcement-tasks--${Math.min(tasks.length, 3)}`}>{tasks.map((task, taskIndex) => <span key={`${task}-${taskIndex}`}><i>{taskIndex + 1}</i>{task}</span>)}</div>}
      <div className="announcement-slide__quote">“Kỷ luật tạo nên khác biệt.”</div>
    </section>
  )
}
