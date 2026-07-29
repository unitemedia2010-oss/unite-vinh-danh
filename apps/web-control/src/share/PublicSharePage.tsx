import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wifi,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { Brand } from '../components/Brand'
import { RankBadge } from '../components/RankBadge'
import { getRecognitionVisualPreset } from '../data/recognitionPresets'
import { formatVnd } from '../lib/format'
import { honoreeContextLabel } from '../lib/honoreeDisplay'
import { playlistConfigFromReleaseManifest } from '../lib/releaseManifest'
import {
  getPublicShareManifest,
  PublicShareClientError,
} from '../lib/publicShareClient'
import type { Board, PlaylistDraftItem } from '../types'
import type { WebScreenRelease } from '../lib/webScreenClient'

type ShareStatus = 'loading' | 'ready' | 'empty' | 'error' | 'demo-blocked'

interface ShareDataset {
  release: WebScreenRelease
  slides: Array<PlaylistDraftItem & { recognitionBoard: Board }>
  periodLabel: string
  importBatchId: string
}

const REFRESH_INTERVAL_MS = 30_000

const readBoardFromHash = () => {
  const query = window.location.hash.split('?')[1] || ''
  return new URLSearchParams(query).get('board') || ''
}

const releasePeriodLabel = (release: WebScreenRelease) => {
  const value = release.manifest.period_label
  if (typeof value === 'string' && value.trim()) return value.trim()
  const match = release.periodId.match(/^(\d{4})-(\d{1,2})$/)
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : release.periodId
}

const parseShareDataset = (release: WebScreenRelease): ShareDataset | null | 'demo' => {
  const importBatchId = release.manifest.import_batch_id
  if (typeof importBatchId !== 'string' || !importBatchId.trim()) return 'demo'
  if (release.status !== 'published') return null
  if (release.activateAt) {
    const activationTime = Date.parse(release.activateAt)
    if (Number.isFinite(activationTime) && activationTime > Date.now()) return null
  }

  const config = playlistConfigFromReleaseManifest(release.manifest)
  if (!config) return null
  const slides = config.items
    .filter((item): item is PlaylistDraftItem & { recognitionBoard: Board } => (
      item.kind === 'recognition'
      && Boolean(item.recognitionBoard)
      && Boolean(item.recognitionBoard?.honorees.length)
    ))
  if (!slides.length) return null

  return {
    release,
    slides,
    periodLabel: releasePeriodLabel(release),
    importBatchId: importBatchId.trim(),
  }
}

const dateTimeLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

const buildShareUrl = (boardId?: string) => {
  const base = window.location.href.split('#')[0]
  return `${base}#/share${boardId ? `?board=${encodeURIComponent(boardId)}` : ''}`
}

export function PublicSharePage() {
  const [status, setStatus] = useState<ShareStatus>('loading')
  const [dataset, setDataset] = useState<ShareDataset | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState(readBoardFromHash)
  const [message, setMessage] = useState('Đang tải bản vinh danh đã phát hành…')
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const datasetRef = useRef<ShareDataset | null>(null)

  const refresh = useCallback(async (silent = false, signal?: AbortSignal) => {
    if (!silent) setRefreshing(true)
    try {
      const result = await getPublicShareManifest(signal)
      setLastCheckedAt(new Date(result.serverTime))
      if (!result.release) {
        if (silent && datasetRef.current) return
        datasetRef.current = null
        setDataset(null)
        setStatus('empty')
        setMessage('Chưa có bản vinh danh thật nào được phát hành để chia sẻ.')
        return
      }
      const parsed = parseShareDataset(result.release)
      if (parsed === 'demo') {
        if (silent && datasetRef.current) return
        datasetRef.current = null
        setDataset(null)
        setStatus('demo-blocked')
        setMessage('Bản đang có là dữ liệu demo nên không được hiển thị trên link chia sẻ.')
        return
      }
      if (!parsed) {
        if (silent && datasetRef.current) return
        datasetRef.current = null
        setDataset(null)
        setStatus('empty')
        setMessage('Bản phát hành hiện chưa có bảng vinh danh hợp lệ để chia sẻ.')
        return
      }
      datasetRef.current = parsed
      setDataset(parsed)
      setStatus('ready')
      setMessage('')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (silent && datasetRef.current) return
      datasetRef.current = null
      setDataset(null)
      setStatus('error')
      setMessage(error instanceof PublicShareClientError
        ? error.message
        : 'Không thể tải bản vinh danh. Vui lòng thử lại.')
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let controller = new AbortController()
    const refreshInBackground = () => {
      controller.abort()
      controller = new AbortController()
      void refresh(true, controller.signal)
    }
    refreshInBackground()
    const timer = window.setInterval(refreshInBackground, REFRESH_INTERVAL_MS)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshInBackground()
    }
    const selectFromHistory = () => setSelectedBoardId(readBoardFromHash())
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('online', refreshWhenVisible)
    window.addEventListener('hashchange', selectFromHistory)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenVisible)
      window.removeEventListener('hashchange', selectFromHistory)
    }
  }, [refresh])

  const selectedSlide = useMemo(() => {
    if (!dataset) return null
    return dataset.slides.find((slide) => slide.recognitionBoard.id === selectedBoardId)
      ?? dataset.slides[0]
  }, [dataset, selectedBoardId])

  useEffect(() => {
    document.title = selectedSlide
      ? `${selectedSlide.recognitionBoard.title} · Unite Vinh Danh`
      : 'Unite Vinh Danh · Bản chia sẻ'
  }, [selectedSlide])

  const selectBoard = (boardId: string) => {
    setSelectedBoardId(boardId)
    window.history.replaceState(null, '', buildShareUrl(boardId))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const moveBoard = (direction: -1 | 1) => {
    if (!dataset || !selectedSlide) return
    const current = dataset.slides.indexOf(selectedSlide)
    const next = (current + direction + dataset.slides.length) % dataset.slides.length
    selectBoard(dataset.slides[next].recognitionBoard.id)
  }

  const copyLink = async () => {
    const url = buildShareUrl(selectedSlide?.recognitionBoard.id)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.prompt('Sao chép đường dẫn này:', url)
    }
  }

  const share = async () => {
    if (!selectedSlide) return
    const board = selectedSlide.recognitionBoard
    const url = buildShareUrl(board.id)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${board.title} · Unite Vinh Danh`,
          text: `${board.subtitle} — ${dataset?.periodLabel ?? ''}`,
          url,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copyLink()
  }

  if (status !== 'ready' || !dataset || !selectedSlide) {
    return (
      <div className="public-share public-share--state">
        <header className="public-share__header"><Brand inverse /></header>
        <main className="share-state-card" aria-live="polite">
          <span className={`share-state-card__icon share-state-card__icon--${status}`}>
            {status === 'loading'
              ? <RefreshCw className="is-spinning" />
              : status === 'demo-blocked'
                ? <ShieldCheck />
                : <AlertTriangle />}
          </span>
          <p>UNITE GROUP · VINH DANH</p>
          <h1>{status === 'loading' ? 'ĐANG TẢI DỮ LIỆU' : 'CHƯA CÓ BẢN CÔNG KHAI'}</h1>
          <span>{message}</span>
          {status !== 'loading' && (
            <button onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'is-spinning' : ''} />
              {refreshing ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
            </button>
          )}
          <small>Trang này không sử dụng tên hoặc doanh số demo thay cho dữ liệu Sheet.</small>
        </main>
      </div>
    )
  }

  const board = selectedSlide.recognitionBoard
  const hasRanking = board.honorees.length > 3
  const preset = getRecognitionVisualPreset(board.id)
  const backgroundUrl = selectedSlide.backgroundUrl || preset?.backgroundUrl
  const boardStyle = backgroundUrl
    ? { '--share-board-bg': `url("${backgroundUrl}")` } as CSSProperties
    : undefined

  return (
    <div className="public-share">
      <header className="public-share__header">
        <a href={buildShareUrl()} aria-label="Tất cả bảng vinh danh"><Brand inverse /></a>
        <div className="public-share__status">
          <Wifi size={15} /><span>DỮ LIỆU ĐÃ PHÁT HÀNH</span>
        </div>
        <div className="public-share__actions">
          <button onClick={copyLink} aria-label={copied ? 'Đã sao chép liên kết' : 'Sao chép liên kết'}>
            {copied ? <Check /> : <Copy />}<span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
          </button>
          <button className="public-share__share-button" onClick={share} aria-label="Chia sẻ bảng vinh danh">
            <Share2 /><span>Chia sẻ</span>
          </button>
        </div>
      </header>

      <main className="public-share__main">
        <section className={`share-board ${hasRanking ? 'share-board--with-ranking' : 'share-board--top-only'}`} style={boardStyle}>
          <div className="share-board__backdrop" />
          <div className="share-board__heading">
            {preset?.badgeUrl
              ? <img src={preset.badgeUrl} alt={`Huy hiệu ${preset.badgeLabel || board.title}`} />
              : <span><Trophy /></span>}
            <div>
              <p>{board.subtitle}</p>
              <h1>{board.title}</h1>
              <small>{board.threshold}</small>
            </div>
          </div>

          <div className="share-board__stage">
            <div className="share-podium">
              {board.honorees.slice(0, 3).map((person) => (
                <article className={`share-winner share-winner--${person.rank}`} key={`${person.rank}-${person.name}`}>
                  <div className="share-winner__halo" />
                  <span className="share-winner__medal">
                    <RankBadge rank={person.rank} />
                  </span>
                  <Avatar person={person} size="xl" glow={person.rank === 1} presentation="cutout" />
                  <i>HẠNG {person.rank}</i>
                  <h2>{person.name}</h2>
                  <p>{honoreeContextLabel(board.group, person)}</p>
                  <strong>{formatVnd(person.revenue)}</strong>
                  <div className="share-winner__base"><span>{person.rank}</span></div>
                </article>
              ))}
            </div>

            {hasRanking && (
              <div className="share-ranking">
                <div className="share-ranking__head"><span>TOP 10 XUẤT SẮC</span><span>DOANH SỐ</span></div>
                {board.honorees.slice(3, 10).map((person) => (
                  <article key={`${person.rank}-${person.name}`}>
                    <span>{String(person.rank).padStart(2, '0')}</span>
                    <Avatar person={person} size="sm" />
                    <div><strong>{person.name}</strong><small>{honoreeContextLabel(board.group, person)}</small></div>
                    <b>{formatVnd(person.revenue)}</b>
                  </article>
                ))}
              </div>
            )}
          </div>

          <p className="share-board__caption"><Sparkles /> Thành tích hôm nay là cảm hứng cho hành trình ngày mai</p>
        </section>

        <section className="share-navigation" aria-label="Chọn bảng vinh danh">
          <button className="share-navigation__arrow" onClick={() => moveBoard(-1)} aria-label="Bảng trước"><ChevronLeft /></button>
          <div className="share-navigation__tabs">
            {dataset.slides.map((slide) => {
              const itemBoard = slide.recognitionBoard
              return (
                <button
                  key={itemBoard.id}
                  className={itemBoard.id === board.id ? 'active' : ''}
                  onClick={() => selectBoard(itemBoard.id)}
                >
                  <span>{itemBoard.title}</span><small>{itemBoard.honorees.length} hạng</small>
                </button>
              )
            })}
          </div>
          <button className="share-navigation__arrow" onClick={() => moveBoard(1)} aria-label="Bảng sau"><ChevronRight /></button>
        </section>

        <footer className="public-share__footer">
          <div><ShieldCheck /><span><strong>Bản {dataset.release.releaseVersion}</strong> · {dataset.periodLabel}</span></div>
          <p>Dữ liệu từ lô đã duyệt <code>{dataset.importBatchId.slice(0, 8)}</code> · cập nhật {dateTimeLabel(dataset.release.updatedAt)}</p>
          {lastCheckedAt && <small>Tự kiểm tra bản mới mỗi 30 giây · lần cuối {lastCheckedAt.toLocaleTimeString('vi-VN')}</small>}
        </footer>
      </main>
    </div>
  )
}
