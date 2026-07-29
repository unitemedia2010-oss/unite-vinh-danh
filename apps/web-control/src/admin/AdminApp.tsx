import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  CirclePlay,
  CloudOff,
  Crown,
  DatabaseZap,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Link2,
  ListVideo,
  MapPin,
  Medal,
  Megaphone,
  Menu,
  MonitorSmartphone,
  MoreHorizontal,
  PackageCheck,
  PencilLine,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { Brand } from '../components/Brand'
import { HealthIcon, ReleaseIcon, StatusPill } from '../components/Status'
import { boards, sourceSheetUrl } from '../data/mock'
import { saveCloudPlaylistDraft } from '../lib/cloudPlaylistSync'
import { formatVnd } from '../lib/format'
import { usePlaylistConfig } from '../lib/playlistConfig'
import { getPublicShareManifest } from '../lib/publicShareClient'
import { buildReleaseManifest, playlistConfigFromReleaseManifest } from '../lib/releaseManifest'
import {
  approveRecognitionImportBatch,
  listRecognitionImportBatches,
  loadLatestRecognitionBatch,
  recognitionWarningText,
  type RecognitionBatchSnapshot,
  type RecognitionImportBatch,
} from '../lib/supabaseRecognitionRepository'
import {
  createReadyPlaylistRelease,
  publishReleaseWithAdminSession,
} from '../lib/supabasePlaylistRepository'
import { EmployeePhotosPage } from './EmployeePhotosPage'
import { PlaylistEditorPage } from './PlaylistEditorPage'
import {
  approvePairingCode,
  getSupabase,
  invokeSheetSync,
  isSupabaseConfigured,
  loadPairingConsole,
  sheetSourceId,
  type DeviceRegistration,
  type ScreenOption,
} from '../lib/supabase'
import type { Board } from '../types'

type Page = 'dashboard' | 'imports' | 'boards' | 'photos' | 'playlist' | 'devices' | 'releases' | 'settings'

const navItems: Array<{ id: Page; label: string; icon: typeof LayoutDashboard; badge?: string }> = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'imports', label: 'Dữ liệu Sheet', icon: DatabaseZap },
  { id: 'boards', label: 'Bảng vinh danh', icon: Trophy },
  { id: 'photos', label: 'Ảnh nhân sự', icon: UserRound },
  { id: 'playlist', label: 'Nội dung & Playlist', icon: ListVideo },
  { id: 'devices', label: 'Thiết bị TV', icon: MonitorSmartphone, badge: '9' },
  { id: 'releases', label: 'Bản phát hành', icon: PackageCheck },
  { id: 'settings', label: 'Cài đặt hệ thống', icon: Settings2 },
]

const pageTitles: Record<Page, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: 'GOOD MORNING, ADMIN', title: 'Trung tâm điều phối', description: 'Theo dõi dữ liệu, nội dung và 9 màn hình trong một nơi.' },
  imports: { eyebrow: 'NGUỒN DỮ LIỆU', title: 'Đồng bộ Google Sheet', description: 'Đọc bảng xếp hạng kế toán đã chốt, kiểm tra thay đổi trước khi duyệt.' },
  boards: { eyebrow: 'SNAPSHOT VINH DANH', title: 'Kiểm duyệt bảng vinh danh', description: 'Đối soát lô Supabase mới nhất trước khi phát hành tới màn hình.' },
  photos: { eyebrow: 'THƯ VIỆN NHÂN SỰ', title: 'Ảnh Leader & QLCN', description: 'Tải ảnh PNG/WebP nền trong suốt theo MNV để dùng thống nhất trên TV.' },
  playlist: { eyebrow: 'LỊCH PHÁT TOÀN HỆ THỐNG', title: 'Nội dung & Playlist', description: 'Sắp xếp vinh danh, video, sự kiện và thông báo theo ưu tiên.' },
  devices: { eyebrow: '9 CHI NHÁNH', title: 'Thiết bị & màn hình TV', description: 'Kiểm tra kết nối, phiên bản đang chạy và khả năng sẵn sàng.' },
  releases: { eyebrow: 'PHÁT HÀNH CÓ PHIÊN BẢN', title: 'Duyệt, phát và quay lui', description: 'Mỗi lần chỉnh sửa tạo một bản riêng, không ghi đè nội dung đang chạy.' },
  settings: { eyebrow: 'CẤU HÌNH HỆ THỐNG', title: 'Kết nối & quyền truy cập', description: 'Trạng thái Supabase, nguồn Sheet và cài đặt phát mặc định.' },
}

function HeaderActions({ onOpenShare }: { onOpenShare: () => void }) {
  return (
    <div className="header-actions">
      <button className="icon-button" title="Tìm kiếm"><Search size={18} /></button>
      <button className="icon-button has-alert" title="Thông báo"><Bell size={18} /><i /></button>
      <button className="button button--secondary button--screen" onClick={onOpenShare} title="Link công khai chỉ hiển thị dữ liệu đã phát hành">
        <Share2 size={17} /> Mở link chia sẻ <ArrowUpRight size={15} />
      </button>
      <button className="profile-chip">
        <span>MA</span>
        <div><strong>Minh Admin</strong><small>Super Admin</small></div>
        <ChevronDown size={15} />
      </button>
    </div>
  )
}

export function AdminApp() {
  const [page, setPage] = useState<Page>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    const hashPage = window.location.hash.match(/^#\/admin\/([^?]+)/)?.[1] as Page | undefined
    if (hashPage && navItems.some((item) => item.id === hashPage)) setPage(hashPage)
  }, [])

  const navigate = (target: Page) => {
    setPage(target)
    setSidebarOpen(false)
    window.history.replaceState(null, '', `#/admin/${target}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const openLiveTv = () => {
    window.open(`${window.location.href.split('#')[0]}#/tv`, '_blank', 'noopener,noreferrer')
  }

  const openShare = () => {
    window.open(`${window.location.href.split('#')[0]}#/share`, '_blank', 'noopener,noreferrer')
  }

  const meta = pageTitles[page]

  return (
    <div className="admin-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__head">
          <Brand />
          <button className="sidebar__close" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-chip__icon"><Sparkles size={17} /></span>
          <div><small>Không gian làm việc</small><strong>Unite Recognition</strong></div>
          <ChevronDown size={15} />
        </div>
        <nav className="sidebar__nav" aria-label="Điều hướng Admin">
          <small className="nav-label">ĐIỀU KHIỂN</small>
          {navItems.slice(0, 7).map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
                <Icon size={19} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}
              </button>
            )
          })}
          <small className="nav-label nav-label--spaced">HỆ THỐNG</small>
          {navItems.slice(7).map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.label}</span></button>
          })}
        </nav>
        <div className="sidebar__footer">
          <div className="system-health"><span className="pulse-dot" /><div><strong>Hệ thống đang kết nối</strong><small>Supabase · Google Sheet tự động</small></div></div>
          <div className="sidebar__version">CONTROL CENTER <b>v0.1 MVP</b></div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Đóng điều hướng" />}

      <main className="admin-main">
        <header className="topbar">
          <div className="topbar__mobile"><button className="icon-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><Brand compact /></div>
          <HeaderActions onOpenShare={openShare} />
        </header>
        <div className="admin-content">
          <div className="page-heading">
            <div><p>{meta.eyebrow}</p><h1>{meta.title}</h1><span>{meta.description}</span></div>
            <div className="page-heading__pilot"><Radio size={16} /><div><small>PILOT ĐANG CHỌN</small><strong>125 Trần Bình Trọng</strong></div></div>
          </div>

          {page === 'dashboard' && <DashboardPage navigate={navigate} />}
          {page === 'imports' && <ImportsPage notify={notify} />}
          {page === 'boards' && <BoardsPage notify={notify} />}
          {page === 'photos' && <EmployeePhotosPage notify={notify} />}
          {page === 'playlist' && <PlaylistPage notify={notify} />}
          {page === 'devices' && <DevicesPage openLiveTv={openLiveTv} notify={notify} />}
          {page === 'releases' && <ReleasesPage notify={notify} />}
          {page === 'settings' && <SettingsPage notify={notify} />}
        </div>
      </main>
      {toast && <div className="toast"><CircleCheckBig size={18} /><span>{toast}</span></div>}
    </div>
  )
}

function DashboardPage({ navigate }: { navigate: (page: Page) => void }) {
  const [live, setLive] = useState<{
    releaseVersion: string
    periodId: string
    updatedAt: string
    boards: Board[]
    fromCache: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void getPublicShareManifest(controller.signal).then((result) => {
      if (!result.release) throw new Error('Chưa có bản dữ liệu thật được phát hành.')
      const config = playlistConfigFromReleaseManifest(result.release.manifest)
      const liveBoards = config?.items
        .filter((item) => item.kind === 'recognition' && item.recognitionBoard)
        .map((item) => item.recognitionBoard!) ?? []
      if (!liveBoards.length) throw new Error('Bản đang phát chưa có bảng vinh danh hợp lệ.')
      setLive({
        releaseVersion: result.release.releaseVersion,
        periodId: result.release.periodId,
        updatedAt: result.release.updatedAt,
        boards: liveBoards,
        fromCache: result.fromCache,
      })
      setLoadError('')
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setLoadError(error instanceof Error ? error.message : 'Không tải được bản đang phát.')
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const liveBoard = live?.boards.find((board) => board.id === 'leader-ky-lan') ?? live?.boards[0]
  const rankingCount = live?.boards.reduce((total, board) => total + board.honorees.length, 0) ?? 0
  const livePeriod = live ? periodLabel(live.periodId) : 'Đang tải dữ liệu'
  const liveUrl = `${window.location.href.split('#')[0]}#/tv`
  const shareUrl = `${window.location.href.split('#')[0]}#/share`
  return (
    <>
      <section className="release-hero">
        <div className="release-hero__glow" />
        <div className="release-hero__copy">
          <StatusPill tone={live ? 'success' : loading ? 'info' : 'danger'}><Radio size={12} /> {live ? 'DỮ LIỆU THẬT ĐANG PHÁT' : loading ? 'ĐANG TẢI BẢN PHÁT HÀNH' : 'CHƯA KẾT NỐI'}</StatusPill>
          <h2>{livePeriod} {live && <span>· {live.releaseVersion}</span>}</h2>
          <p>{live ? `Lấy từ lô Sheet đã duyệt · ${live.boards.length} bảng · ${rankingCount} lượt xếp hạng.${live.fromCache ? ' Đang dùng bản gần nhất đã lưu.' : ''}` : loadError || 'Đang kiểm tra bản phát hành mới nhất trên Supabase.'}</p>
          <div className="release-hero__actions">
            <button className="button button--gold" onClick={() => window.open(liveUrl, '_blank', 'noopener,noreferrer')}><CirclePlay size={17} /> Mở TV trực tuyến</button>
            <button className="button button--ghost" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}><Share2 size={17} /> Link chia sẻ</button>
            <button className="button button--ghost" onClick={() => navigate('photos')}><UserRound size={17} /> Cập nhật ảnh</button>
          </div>
        </div>
        <div className="release-meter">
          <div className="release-meter__ring"><strong>{live?.boards.length ?? 0}</strong><span>/ 7 BẢNG</span></div>
          <p><b>{live ? 'Sẵn sàng trình chiếu' : 'Đang kiểm tra'}</b><span>TV công khai tự tải lại mỗi 60 giây</span></p>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={PackageCheck} label="Bản đang phát" value={live?.releaseVersion.replace(/^AUTO-/, '') ?? '—'} detail={live ? livePeriod : 'Chưa nhận dữ liệu'} tone="success" trend="LIVE" />
        <MetricCard icon={FileSpreadsheet} label="Lượt xếp hạng" value={String(rankingCount)} detail="tính từ Sheet đã duyệt" tone="info" trend="TỰ ĐỘNG" />
        <MetricCard icon={Trophy} label="Bảng có dữ liệu" value={`${live?.boards.length ?? 0} / 7`} detail="QLCN, Leader và Team" tone="gold" trend={live ? '100%' : '—'} />
        <MetricCard icon={UserRound} label="Ảnh nhân sự" value="Theo MNV" detail="PNG/WebP nền trong suốt" tone="purple" trend="QUẢN LÝ" />
      </section>

      <div className="content-grid content-grid--dashboard">
        <section className="panel branch-panel">
          <PanelHeader eyebrow="ĐƯỜNG DẪN ĐANG DÙNG" title="Mở đúng phiên bản cho từng thiết bị" />
          <div className="activity-list">
            <ActivityItem icon={MonitorSmartphone} tone="gold" title="TV chưa cài APK: mở link TV trực tuyến" meta="#/tv · không cần ghép nối · chỉ dữ liệu thật" />
            <ActivityItem icon={Share2} tone="blue" title="Điện thoại và máy tính: dùng link chia sẻ" meta="#/share · responsive · có nút sao chép/chia sẻ" />
            <ActivityItem icon={Wifi} tone="green" title="TV quản lý theo chi nhánh: dùng màn hình đã ghép nối" meta="#/screen · nhận lịch và playlist riêng từ Admin" />
          </div>
          <div className="panel-note"><ShieldCheck size={17} /><span>Link công khai không lấy tên hoặc doanh số mẫu khi dữ liệu thật bị thiếu.</span></div>
        </section>

        <section className="panel activity-panel">
          <PanelHeader eyebrow="VẬN HÀNH TỰ ĐỘNG" title="Nguồn dữ liệu hiện tại" />
          <div className="activity-list">
            <ActivityItem icon={DatabaseZap} tone="green" title="Google Sheet quyết định tên, Bảng Đấu và doanh số" meta="Apps Script theo dõi thay đổi · Supabase lưu phiên bản" />
            <ActivityItem icon={PackageCheck} tone="gold" title={live ? `Đang phát ${live.releaseVersion}` : 'Đang chờ bản phát hành'} meta={live ? `Cập nhật ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(live.updatedAt))}` : loadError || 'Đang kết nối Supabase'} />
            <ActivityItem icon={UserRound} tone="blue" title="Avatar Leader/QLCN ghép theo MNV" meta="Một ảnh dùng cho bản hiện tại và các kỳ sau" />
          </div>
          <button className="panel-link" onClick={() => navigate('imports')}><History size={16} /> Xem lịch sử đồng bộ Sheet <ArrowRight size={15} /></button>
        </section>
      </div>

      {liveBoard && <section className="panel snapshot-panel">
        <PanelHeader eyebrow="XEM NHANH DỮ LIỆU THẬT" title={`${liveBoard.title} · ${liveBoard.threshold}`} action="Kiểm duyệt bảng" onAction={() => navigate('boards')} />
        <div className="snapshot-layout">
          <div className="snapshot-podium">
            {[liveBoard.honorees[1], liveBoard.honorees[0], liveBoard.honorees[2]].filter(Boolean).map((person) => (
              <div className={`snapshot-person rank-${person.rank}`} key={`${person.rank}-${person.name}-${person.branch}`}>
                <span className="snapshot-rank">#{person.rank}</span><Avatar person={person} size="lg" glow={person.rank === 1} />
                <strong>{person.shortName}</strong><small>{liveBoard.group === 'manager' ? person.branch : person.team}</small><b>{formatVnd(person.revenue)}</b>
              </div>
            ))}
          </div>
          <div className="snapshot-list">
            {liveBoard.honorees.slice(3, 10).map((person) => (
              <div key={person.rank}><span>{String(person.rank).padStart(2, '0')}</span><Avatar person={person} size="sm" /><p><strong>{person.shortName}</strong><small>{person.team}</small></p><b>{formatVnd(person.revenue)}</b></div>
            ))}
          </div>
        </div>
      </section>}
    </>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone, trend }: { icon: typeof Activity; label: string; value: string; detail: string; tone: string; trend: string }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__icon"><Icon size={21} /></div><span>{label}</span><div className="metric-card__value"><strong>{value}</strong><em>{trend}</em></div><p>{detail}</p>
    </article>
  )
}

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel-header"><div><span>{eyebrow}</span><h3>{title}</h3></div>{action && <button onClick={onAction}>{action}<ChevronRight size={16} /></button>}</div>
  )
}

function ActivityItem({ icon: Icon, tone, title, meta }: { icon: typeof Activity; tone: string; title: string; meta: string }) {
  return <div className="activity-item"><span className={`activity-item__icon activity-item__icon--${tone}`}><Icon size={17} /></span><div><strong>{title}</strong><small>{meta}</small></div></div>
}

const batchDate = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value))

const periodLabel = (periodId: string) => {
  const match = periodId.match(/^(\d{4})-(\d{1,2})$/)
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : periodId
}

const batchStatus = (status: RecognitionImportBatch['status']) => {
  if (status === 'validated') return { label: 'ĐÃ DUYỆT', tone: 'success' as const }
  if (status === 'failed') return { label: 'LỖI', tone: 'danger' as const }
  if (status === 'needs_review') return { label: 'CẦN REVIEW', tone: 'warning' as const }
  if (status === 'archived') return { label: 'LƯU TRỮ', tone: 'neutral' as const }
  return { label: status === 'importing' ? 'ĐANG NHẬP' : 'ĐÃ NHẬP', tone: 'info' as const }
}

function ImportsPage({ notify }: { notify: (message: string) => void }) {
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [batches, setBatches] = useState<RecognitionImportBatch[]>([])
  const [loadError, setLoadError] = useState('')
  const [approving, setApproving] = useState(false)

  const refreshBatches = async () => {
    if (!isSupabaseConfigured) return
    setLoading(true)
    try {
      setBatches(await listRecognitionImportBatches())
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không đọc được lịch sử import.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refreshBatches() }, [])

  const syncNow = async () => {
    setSyncing(true)
    const result = await invokeSheetSync({ force: false })
    setSyncing(false)
    if (result.error) {
      notify(isSupabaseConfigured ? `Không thể đồng bộ: ${result.error.message}` : 'Chưa cấu hình kết nối Supabase.')
      return
    }
    await refreshBatches()
    notify('Đã kiểm tra Sheet. Snapshot mới chỉ được tạo khi dữ liệu nguồn thay đổi và đạt điều kiện nhập.')
  }

  const latest = batches[0]
  const approveLatest = async () => {
    if (!latest || latest.status === 'validated') return
    const note = latest.warningCount > 0
      ? window.prompt(`Lô có ${latest.warningCount} cảnh báo. Nhập lý do chấp nhận cảnh báo để duyệt:`)?.trim()
      : window.prompt('Ghi chú duyệt lô (khuyến nghị):')?.trim()
    if (latest.warningCount > 0 && !note) {
      notify('Đã hủy duyệt: lô có cảnh báo nên bắt buộc phải ghi rõ lý do.')
      return
    }
    if (!window.confirm(`Duyệt lô #${latest.sequence} kỳ ${latest.periodId}? RPC sẽ kiểm tra lại số cảnh báo và lỗi trước khi cập nhật.`)) return
    setApproving(true)
    try {
      await approveRecognitionImportBatch({
        batchId: latest.id,
        expectedWarningCount: latest.warningCount,
        note,
      })
      await refreshBatches()
      notify(`Đã duyệt an toàn lô #${latest.sequence}.`)
    } catch (error) {
      notify(`Không thể duyệt lô: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApproving(false)
    }
  }

  return (
    <>
      <section className="source-card">
        <div className="source-card__icon"><FileSpreadsheet size={28} /></div>
        <div className="source-card__copy"><div><StatusPill tone={loadError ? 'warning' : 'success'}>{loadError ? 'CHƯA ĐỌC ĐƯỢC SUPABASE' : 'ĐÃ KẾT NỐI NGUỒN'}</StatusPill><StatusPill tone="info">ĐỒNG BỘ CÓ KIỂM SOÁT</StatusPill></div><h2>Dữ liệu doanh số thô từ kế toán</h2><p>Google Sheet ID <code>{sheetSourceId.slice(0, 12)}…</code></p><span><RefreshCw size={14} /> Đồng bộ gần nhất: {latest ? batchDate(latest.importedAt) : loading ? 'Đang tải…' : 'Chưa có lô thật'}</span></div>
        <div className="source-card__actions"><a className="button button--secondary" href={sourceSheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở Sheet gốc</a><button className="button button--gold" onClick={syncNow} disabled={syncing}><RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Đang đọc…' : 'Đồng bộ ngay'}</button></div>
      </section>

      <div className="content-grid content-grid--imports">
        <section className="panel">
          <PanelHeader eyebrow="MAPPING ĐANG HOẠT ĐỘNG" title="2 vùng dữ liệu thật đang đọc" action="Chỉnh mapping" onAction={() => notify('Mapping được lưu trong public.sheet_mappings và luôn tạo snapshot có version.')} />
          <div className="mapping-list">
            {[
              ['DS-KV', 'Khu vực và quản lý chi nhánh', 'DS-KV!B1:N20', 'Có cột Bảng Đấu'],
              ['DS-TEAM', 'Team và thông tin Leader', 'DS-TEAM!B1:S1000', 'Có cột Bảng Đấu'],
            ].map(([code, title, range, count]) => (
              <div className="mapping-row" key={code}><span>{code}</span><div><strong>{title}</strong><small>{range}</small></div><em>{count}</em><CircleCheckBig size={18} /></div>
            ))}
          </div>
        </section>
        <section className="panel warning-panel">
          <PanelHeader eyebrow="ĐỐI SOÁT LÔ MỚI NHẤT" title={latest ? `Lô #${latest.sequence} · ${periodLabel(latest.periodId)}` : 'Chưa có lô Supabase'} />
          {latest?.warnings.slice(0, 3).map((warning, index) => <div className="warning-card" key={`${latest.id}-${index}`}><span><PencilLine size={19} /></span><div><strong>Cảnh báo #{index + 1}</strong><p>{recognitionWarningText(warning)}</p><small>Nguồn: import_batches.warnings</small></div></div>)}
          {latest && latest.warningCount === 0 && <div className="warning-card warning-card--resolved"><span><CircleCheckBig size={19} /></span><div><strong>Không có cảnh báo trong lô</strong><p>{latest.rowCount} bản ghi đã được nhập</p><small>Vẫn cần Admin duyệt trước khi phát hành.</small></div></div>}
          {!latest && <div className="warning-card"><span><CloudOff size={19} /></span><div><strong>{loadError || 'Chưa có dữ liệu thật'}</strong><p>Đăng nhập Supabase rồi bấm Đồng bộ ngay.</p><small>Hệ thống sẽ để trống thay vì thay bằng tên hoặc doanh số minh họa.</small></div></div>}
          {latest && latest.status !== 'validated' ? <div className="warning-summary warning-summary--blocked"><ShieldCheck size={18} /><p><strong>RPC duyệt an toàn dành cho Admin có quyền</strong><span>Lô có cảnh báo bắt buộc nhập ghi chú; server kiểm tra lại số cảnh báo trước khi cập nhật.</span></p><button className="button button--gold" onClick={() => void approveLatest()} disabled={approving}>{approving ? 'Đang duyệt…' : 'Duyệt lô mới nhất'}</button></div> : latest && <div className="warning-summary"><ShieldCheck size={18} /><p><strong>Lô đã được xác thực</strong><span>Có thể dùng để tạo bản READY.</span></p></div>}
        </section>
      </div>

      <section className="panel table-panel">
        <PanelHeader eyebrow="LỊCH SỬ SUPABASE" title={batches.length ? 'Các lô import thật gần nhất' : 'Chưa có lô dữ liệu thật'} />
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Mã lô</th><th>Thời gian</th><th>Kỳ dữ liệu</th><th>Trạng thái</th><th>Bản ghi</th><th>Nguồn</th><th>Thực hiện</th><th /></tr></thead><tbody>
          {batches.map((batch) => {
            const state = batchStatus(batch.status)
            return <tr key={batch.id}><td><strong>#{batch.sequence}</strong></td><td>{batchDate(batch.importedAt)}</td><td>{batch.periodId}</td><td><StatusPill tone={state.tone}>{state.label}</StatusPill></td><td>{batch.rowCount} <small>· {batch.warningCount} cảnh báo</small></td><td>{batch.sourceHash.slice(0, 10)}</td><td>{batch.importedBy ? 'Admin' : 'Lịch tự động'}</td><td><button className="row-action"><MoreHorizontal size={17} /></button></td></tr>
          })}
          {!batches.length && !loading && <tr><td colSpan={8}><div className="table-empty-state"><CloudOff size={18} /><span>{loadError || 'Chưa có lô nào trong Supabase. Hãy đăng nhập rồi đồng bộ Sheet.'}</span></div></td></tr>}
        </tbody></table></div>
      </section>
    </>
  )
}

function BoardsPage({ notify }: { notify: (message: string) => void }) {
  const [group, setGroup] = useState<Board['group']>('leader')
  const [snapshot, setSnapshot] = useState<RecognitionBatchSnapshot | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    loadLatestRecognitionBatch()
      .then((next) => { if (active) { setSnapshot(next); setLoadError('') } })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const usingLiveData = Boolean(snapshot?.boards.length)
  const reviewBoards = useMemo(() => {
    if (!snapshot?.boards.length) {
      return boards.map((board) => ({
        ...board,
        honorees: [],
        sourceRange: 'Chưa tải được dữ liệu thật từ Supabase',
      }))
    }
    const liveById = new Map(snapshot.boards.map((board) => [board.id, board]))
    const known = boards.map((board) => liveById.get(board.id) ?? {
      ...board,
      honorees: [],
      sourceRange: `Lô #${snapshot.batch.sequence} chưa có kết quả cho bảng này`,
    })
    const knownIds = new Set(known.map((board) => board.id))
    return [...known, ...snapshot.boards.filter((board) => !knownIds.has(board.id))]
  }, [snapshot])
  const available = useMemo(() => reviewBoards.filter((board) => board.group === group), [group, reviewBoards])
  const [selectedId, setSelectedId] = useState('leader-ky-lan')
  const selected = available.find((board) => board.id === selectedId) || available[0]
  const previewHonorees = selected.honorees

  useEffect(() => { if (available[0]) setSelectedId(available[0].id) }, [available])

  return (
    <>
      <div className="board-toolbar">
        <div className="segmented-control">
          {([['manager', 'Quản lý CN'], ['leader', 'Leader'], ['fulltime', 'Sale Full-time'], ['parttime', 'Sale Part-time'], ['team', 'Team']] as const).map(([id, label]) => <button className={group === id ? 'active' : ''} onClick={() => setGroup(id)} key={id}>{label}</button>)}
        </div>
        <div className="board-toolbar__actions"><StatusPill tone={usingLiveData ? snapshot?.batch.status === 'validated' ? 'success' : 'warning' : loading ? 'info' : 'danger'}>{usingLiveData ? `SUPABASE · ${snapshot?.batch.status.toUpperCase()}` : loading ? 'ĐANG TẢI SUPABASE' : 'CHƯA CÓ DỮ LIỆU THẬT'}</StatusPill><button className="button button--secondary" onClick={() => notify(usingLiveData ? `Nguồn ${selected.sourceRange}.` : loadError || 'Chưa có lô dữ liệu thật để xem nguồn.')}><SlidersHorizontal size={16} /> Xem nguồn</button><button className="button button--gold" onClick={() => notify(snapshot?.batch.status === 'validated' ? `Lô #${snapshot.batch.sequence} đã được duyệt.` : 'Duyệt toàn bộ lô tại trang Dữ liệu Sheet trước khi phát hành.')}><ShieldCheck size={16} /> Trạng thái duyệt</button></div>
      </div>

      {available.length > 1 && <div className="subtabs">{available.map((board) => <button className={selected.id === board.id ? 'active' : ''} onClick={() => setSelectedId(board.id)} key={board.id}><span>{board.title}</span><small>{board.threshold}</small></button>)}</div>}

      <div className="board-review-grid">
        <section className="board-preview">
          <div className="board-preview__ambient" />
          <div className="board-preview__header"><Brand /><span>{usingLiveData ? `DỮ LIỆU THẬT · ${periodLabel(snapshot!.batch.periodId).toUpperCase()}` : 'ĐANG CHỜ DỮ LIỆU THẬT TỪ SUPABASE'}</span></div>
          <div className="board-preview__title"><small>{selected.subtitle}</small><h2>{selected.title}</h2><p>{selected.threshold}</p></div>
          <div className="preview-layout">
            {previewHonorees.length ? <>
              <div className="preview-podium">
                {[previewHonorees[1], previewHonorees[0], previewHonorees[2]].filter(Boolean).map((person) => (
                  <div className={`preview-person preview-person--${person.rank}`} key={person.name}><span className="preview-medal">{person.rank === 1 ? <Crown /> : <Medal />}</span><Avatar person={person} size="xl" glow={person.rank === 1} /><i>HẠNG {person.rank}</i><strong>{person.shortName}</strong><small>{person.team}</small><b>{formatVnd(person.revenue)}</b></div>
                ))}
              </div>
              {previewHonorees.length > 3 && <div className="preview-ranking"><h3>TOP 10 XUẤT SẮC</h3>{previewHonorees.slice(3, 10).map((person) => <div key={person.rank}><span>{person.rank}</span><Avatar person={person} size="sm" /><p><strong>{person.shortName}</strong><small>{person.team}</small></p><b>{formatVnd(person.revenue)}</b></div>)}</div>}
            </> : <div className="board-empty-state"><Trophy size={34} /><strong>Chưa có kết quả thật cho bảng {selected.title}</strong><span>{loading ? 'Đang tải lô mới nhất từ Supabase.' : loadError || `Sheet hiện không có nhân sự đạt ngưỡng ${selected.threshold.toLowerCase()}.`}</span></div>}
          </div>
          <div className="board-preview__footer"><span>UNITE GROUP · NÂNG TẦM CUỘC SỐNG</span><i>•</i><span>Nguồn {selected.sourceRange}</span></div>
        </section>

        <aside className="review-sidebar">
          <div className="review-card"><div className="review-card__head"><span>THÔNG TIN BẢNG</span><StatusPill tone={usingLiveData ? 'success' : 'warning'}>{usingLiveData ? 'SNAPSHOT SUPABASE' : 'CHƯA CÓ SNAPSHOT'}</StatusPill></div><dl><div><dt>Nguồn kiểm tra</dt><dd>{selected.sourceRange}</dd></div><div><dt>Số hạng</dt><dd>{selected.honorees.length}</dd></div><div><dt>Avatar có sẵn</dt><dd>{selected.honorees.filter((person) => person.photoUrl).length}/{selected.honorees.length}</dd></div><div><dt>Ghi đè Admin</dt><dd>Không cho phép tại đây</dd></div><div><dt>Thời lượng</dt><dd>{selected.honorees.length > 3 ? '18 giây' : '14 giây'}</dd></div></dl></div>
          <div className="review-card"><div className="review-card__head"><span>ĐỐI SOÁT SNAPSHOT</span><button disabled><PencilLine size={15} /> Chỉ đọc</button></div><p className="helper-text"><ShieldCheck size={15} /> {usingLiveData ? 'Kết quả lấy từ award_results; mọi thay đổi phải đi qua Sheet và lô dữ liệu mới.' : 'Không có dữ liệu giả thay thế. Hãy đăng nhập, đồng bộ Sheet và duyệt lô.'}</p></div>
          <button className="button button--wide button--secondary" onClick={() => window.open(`${window.location.href.split('#')[0]}#/tv?board=${selected.id}`, '_blank')}><Eye size={17} /> Xem bản TV đã phát hành</button>
        </aside>
      </div>
    </>
  )
}

function PlaylistPage({ notify }: { notify: (message: string) => void }) {
  return <PlaylistEditorPage notify={notify} />
}

function DevicesPage({ openLiveTv, notify }: { openLiveTv: () => void; notify: (message: string) => void }) {
  const [pairingOpen, setPairingOpen] = useState(false)
  const [pairingCode, setPairingCode] = useState('')
  const [screenId, setScreenId] = useState('')
  const [screenOptions, setScreenOptions] = useState<ScreenOption[]>([])
  const [registrations, setRegistrations] = useState<DeviceRegistration[]>([])
  const [pairingBusy, setPairingBusy] = useState(false)
  const [deviceError, setDeviceError] = useState('')
  const approvedByScreen = useMemo(() => {
    const mapped = new Map<string, DeviceRegistration>()
    registrations
      .filter((registration) => registration.status === 'approved' && registration.screen_id)
      .forEach((registration) => mapped.set(registration.screen_id!, registration))
    return mapped
  }, [registrations])
  const counts = {
    configured: screenOptions.length,
    paired: screenOptions.filter((screen) => approvedByScreen.has(screen.id)).length,
    pending: registrations.filter((registration) => registration.status === 'pending').length,
  }

  const refreshPairing = async () => {
    if (!isSupabaseConfigured) {
      setDeviceError('Supabase chưa được cấu hình.')
      return
    }
    setPairingBusy(true)
    try {
      const data = await loadPairingConsole()
      setScreenOptions(data.screens)
      setRegistrations(data.registrations)
      setScreenId((current) => current || data.screens[0]?.id || '')
      setDeviceError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDeviceError(message)
    } finally {
      setPairingBusy(false)
    }
  }

  useEffect(() => {
    void refreshPairing()
  }, [])

  const approve = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pairingCode.trim() || !screenId) return
    setPairingBusy(true)
    try {
      await approvePairingCode(pairingCode, screenId)
      notify('Đã duyệt TV. Thiết bị sẽ tự nhận cấu hình trong tối đa 5 giây.')
      setPairingCode('')
      await refreshPairing()
    } catch (error) {
      notify(`Ghép nối thất bại: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setPairingBusy(false)
    }
  }

  const togglePairing = () => {
    if (!isSupabaseConfigured) return notify('Hãy cấu hình và đăng nhập Supabase trước khi ghép TV.')
    setPairingOpen((value) => !value)
  }

  return (
    <>
      <section className="device-summary"><div><span className="device-summary__icon"><MonitorSmartphone size={28} /></span><div><h2>{counts.configured || 0} màn hình đã cấu hình</h2><p>{deviceError ? `Chưa tải được trạng thái: ${deviceError}` : 'Danh sách lấy trực tiếp từ Supabase, không dùng trạng thái minh họa.'}</p></div></div><div className="health-legend"><span className="online"><i />{counts.paired} Đã ghép</span><span className="warning"><i />{counts.pending} Chờ duyệt</span><span className="offline"><i />{Math.max(0, counts.configured - counts.paired)} Chưa ghép</span></div><button className="button button--gold" onClick={togglePairing}><Link2 size={16} /> {pairingOpen ? 'Đóng pairing' : 'Ghép nối TV'}</button></section>
      {pairingOpen && <section className="panel pairing-console"><div className="pairing-console__head"><div><span>GHÉP NỐI THIẾT BỊ THẬT</span><h3>Nhập mã đang hiện trên TV</h3><p>Admin chọn đúng màn hình/chi nhánh rồi duyệt. Mã hết hạn sau 30 phút.</p></div><button className="button button--secondary" onClick={refreshPairing} disabled={pairingBusy}><RefreshCw size={15} className={pairingBusy ? 'spin' : ''} /> Làm mới</button></div><form onSubmit={approve}><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Mã 6 số" aria-label="Mã pairing" required /><select value={screenId} onChange={(event) => setScreenId(event.target.value)} required><option value="">Chọn màn hình</option>{screenOptions.map((screen) => <option value={screen.id} key={screen.id}>{screen.screen_code} · {screen.name}</option>)}</select><button className="button button--gold" type="submit" disabled={pairingBusy || pairingCode.length !== 6 || !screenId}>Duyệt thiết bị</button></form><div className="pending-devices"><strong>Đang chờ duyệt</strong>{registrations.filter((item) => item.status === 'pending').length ? registrations.filter((item) => item.status === 'pending').map((item) => <button key={item.id} onClick={() => setPairingCode(item.pairing_code)}><span>{item.pairing_code.replace(/(\d{3})(\d{3})/, '$1 $2')}</span><small>{item.device_name || item.device_id} · {item.app_version || 'chưa rõ version'}</small></button>) : <p>Chưa có TV nào gửi yêu cầu ghép nối.</p>}</div></section>}
      <div className="device-grid">
        {screenOptions.map((screen) => {
          const registration = approvedByScreen.get(screen.id)
          return (
          <article className={`device-card device-card--${registration ? 'online' : 'offline'}`} key={screen.id}>
            <div className="device-card__top"><div className="device-card__screen"><MonitorSmartphone size={29} /><span>{screen.screen_code}</span></div><StatusPill tone={registration ? 'success' : 'neutral'}>{registration ? 'ĐÃ GHÉP' : 'CHƯA GHÉP'}</StatusPill></div>
            <div className="device-card__title"><h3>{screen.name}</h3><p><MapPin size={14} />{screen.branch?.address || screen.branch?.name || 'Chưa cập nhật địa chỉ'}</p></div>
            <dl><div><dt>Thiết bị</dt><dd>{registration?.device_name || registration?.device_id || 'Chưa có thiết bị'}</dd></div><div><dt>Nền tảng</dt><dd>{registration?.device_type || '—'}</dd></div><div><dt>Phiên bản app</dt><dd><b>{registration?.app_version || '—'}</b></dd></div><div><dt>Khu vực</dt><dd>{screen.branch?.code || '—'}</dd></div></dl>
            <div className="device-card__footer"><button onClick={openLiveTv}><Eye size={16} />Mở TV trực tuyến</button><button onClick={() => void refreshPairing()}><RefreshCw size={16} />Làm mới</button><button><MoreHorizontal size={17} /></button></div>
          </article>
        )})}
        {!screenOptions.length && !pairingBusy && <div className="board-empty-state"><MonitorSmartphone size={34} /><strong>Chưa tải được danh sách màn hình thật</strong><span>{deviceError || 'Đăng nhập Supabase để xem và ghép nối TV.'}</span></div>}
      </div>
    </>
  )
}

const suggestedReleaseVersion = (periodId?: string) => {
  const now = new Date()
  const stamp = [
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const period = periodId?.match(/^(\d{4})-(\d{1,2})$/)
  const periodCode = period ? `${String(Number(period[2])).padStart(2, '0')}.${period[1]}` : 'DATA'
  return `R${periodCode}-${stamp}`
}

function ReleasesPage({ notify }: { notify: (message: string) => void }) {
  const { config } = usePlaylistConfig()
  const [releaseVersion, setReleaseVersion] = useState(suggestedReleaseVersion)
  const [validatedSnapshot, setValidatedSnapshot] = useState<RecognitionBatchSnapshot | null>(null)
  const [batchLoading, setBatchLoading] = useState(isSupabaseConfigured)
  const [batchError, setBatchError] = useState('')
  const [readyRelease, setReadyRelease] = useState<{ id: string; version: string } | null>(null)
  const [releaseBusy, setReleaseBusy] = useState<'ready' | 'publish' | ''>('')
  const [published, setPublished] = useState(false)
  const [publishedRelease, setPublishedRelease] = useState<{
    id: string
    version: string
    periodId: string
    updatedAt: string
  } | null>(null)
  const [publishedError, setPublishedError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    loadLatestRecognitionBatch({ validatedOnly: true })
      .then((snapshot) => {
        if (!active) return
        setValidatedSnapshot(snapshot)
        setBatchError('')
        if (snapshot) setReleaseVersion(suggestedReleaseVersion(snapshot.batch.periodId))
      })
      .catch((error) => { if (active) setBatchError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (active) setBatchLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getPublicShareManifest(controller.signal)
      .then((result) => {
        if (!result.release) {
          setPublishedRelease(null)
          setPublishedError('Chưa có bản nào được phát hành.')
          return
        }
        setPublishedRelease({
          id: result.release.id,
          version: result.release.releaseVersion,
          periodId: result.release.periodId,
          updatedAt: result.release.updatedAt,
        })
        setPublishedError('')
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPublishedError(error instanceof Error ? error.message : 'Không tải được bản đang phát.')
      })
    return () => controller.abort()
  }, [])

  const createReady = async () => {
    if (!isSupabaseConfigured) {
      notify('Hãy cấu hình Supabase và đăng nhập Admin trước khi tạo bản READY.')
      return
    }
    if (!releaseVersion.trim()) {
      notify('Hãy nhập mã phiên bản phát hành.')
      return
    }
    if (!validatedSnapshot || validatedSnapshot.boards.length === 0) {
      notify('Chưa có lô Supabase đã validated và có kết quả vinh danh. Hãy đồng bộ rồi duyệt lô trước.')
      return
    }
    setReleaseBusy('ready')
    try {
      const draft = await saveCloudPlaylistDraft(config)
      const ready = await createReadyPlaylistRelease({
        releaseVersion: releaseVersion.trim(),
        playlistId: draft.snapshot.id,
        periodId: validatedSnapshot.batch.periodId,
        importBatchId: validatedSnapshot.batch.id,
        manifest: buildReleaseManifest(draft.snapshot, releaseVersion.trim(), {
          boards: validatedSnapshot.boards,
          periodLabel: periodLabel(validatedSnapshot.batch.periodId),
          periodId: validatedSnapshot.batch.periodId,
          importBatchId: validatedSnapshot.batch.id,
        }),
        targetConfig: { scope: 'all', branchCount: 9, dataSource: 'validated-import-batch' },
      })
      setReadyRelease({ id: ready.id, version: ready.releaseVersion })
      setPublished(false)
      notify(`Đã tạo ${ready.releaseVersion} ở trạng thái READY. Chưa gửi tới TV.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể tạo bản READY.')
    } finally {
      setReleaseBusy('')
    }
  }

  const publishReady = async () => {
    if (!readyRelease) {
      notify('Hãy tạo bản READY trước khi phát hành.')
      return
    }
    if (!window.confirm(`Phát ${readyRelease.version} tới toàn bộ 9 màn hình đã ghép nối?`)) return
    setReleaseBusy('publish')
    try {
      const result = await publishReleaseWithAdminSession({ releaseId: readyRelease.id })
      setPublished(true)
      const current = await getPublicShareManifest().catch(() => null)
      if (current?.release) {
        setPublishedRelease({
          id: current.release.id,
          version: current.release.releaseVersion,
          periodId: current.release.periodId,
          updatedAt: current.release.updatedAt,
        })
        setPublishedError('')
      }
      notify(`Đã phát ${result.releaseVersion ?? readyRelease.version} tới ${result.targets ?? 9} màn hình.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể phát hành tới TV.')
    } finally {
      setReleaseBusy('')
    }
  }

  return (
    <>
      <section className="release-readiness">
        <div><StatusPill tone={validatedSnapshot ? 'success' : 'warning'}>{validatedSnapshot ? 'DỮ LIỆU ĐÃ VALIDATED' : batchLoading ? 'ĐANG KIỂM TRA DỮ LIỆU' : 'CHƯA THỂ PHÁT HÀNH'}</StatusPill><h2>{validatedSnapshot ? `${periodLabel(validatedSnapshot.batch.periodId)} · lô #${validatedSnapshot.batch.sequence}` : 'Cần một lô Supabase đã duyệt'}</h2><p>{validatedSnapshot ? `${validatedSnapshot.boards.length} bảng thật sẽ được đóng gói vào manifest.` : batchError || 'Vào Dữ liệu Sheet để đồng bộ và duyệt lô trước.'}</p></div>
        <div className="readiness-track"><div><span style={{ width: validatedSnapshot ? '100%' : '0%' }} /></div><p><b>{validatedSnapshot ? '100%' : '0%'}</b><span>{validatedSnapshot ? 'Dữ liệu đã đủ điều kiện đóng gói' : 'Chưa có lô đã duyệt'}</span></p></div>
        <button className="button button--secondary" onClick={() => notify(readyRelease ? `Có thể phát lại tín hiệu cho ${readyRelease.version} sau khi bản được publish.` : 'Chưa có bản READY mới để gửi tín hiệu.')}><RefreshCw size={16} /> Gửi lại tín hiệu</button>
      </section>
      <section className="panel release-publisher">
        <div>
          <span>QUY TRÌNH PHÁT AN TOÀN</span>
          <h3>Lưu Cloud → tạo READY → Admin xác nhận phát</h3>
          <p>Bản đang chạy không bị ghi đè. READY chỉ được tạo từ lô validated và lưu đúng import_batch_id để truy vết.</p>
        </div>
        <label>
          <span>Mã phiên bản</span>
          <input
            value={releaseVersion}
            onChange={(event) => setReleaseVersion(event.target.value)}
            disabled={Boolean(readyRelease) || Boolean(releaseBusy)}
            maxLength={80}
          />
        </label>
        <div className="release-publisher__actions">
          {!readyRelease ? (
            <button className="button button--secondary" onClick={() => void createReady()} disabled={Boolean(releaseBusy) || batchLoading || !validatedSnapshot}>
              <PackageCheck size={16} /> {releaseBusy === 'ready' ? 'Đang tạo READY…' : '1. Tạo bản READY'}
            </button>
          ) : (
            <button
              className="button button--secondary"
              onClick={() => {
                setReadyRelease(null)
                setPublished(false)
                setReleaseVersion(suggestedReleaseVersion(validatedSnapshot?.batch.periodId))
              }}
              disabled={Boolean(releaseBusy)}
            >
              <History size={16} /> Tạo phiên bản khác
            </button>
          )}
          <button
            className="button button--gold"
            onClick={() => void publishReady()}
            disabled={!readyRelease || published || Boolean(releaseBusy)}
          >
            <Rocket size={16} /> {published ? 'Đã phát hành' : releaseBusy === 'publish' ? 'Đang phát…' : '2. Phát tới 9 TV'}
          </button>
        </div>
        {readyRelease && (
          <div className={`release-publisher__state ${published ? 'is-published' : ''}`}>
            <CircleCheckBig size={17} />
            <span>{published ? `${readyRelease.version} đang được phân phối.` : `${readyRelease.version} đã READY, chưa phát.`}</span>
          </div>
        )}
      </section>
      <div className="release-list">
        {publishedRelease ? (
          <article className="release-row release-row--live" key={publishedRelease.id}>
            <span className="release-row__icon"><ReleaseIcon state="live" /></span>
            <div className="release-row__version"><strong>{publishedRelease.version}</strong><StatusPill tone="success">ĐANG PHÁT</StatusPill></div>
            <div className="release-row__copy"><strong>{periodLabel(publishedRelease.periodId)}</strong><small>Bản công khai mới nhất từ Supabase</small></div>
            <div><small>TRẠNG THÁI DỮ LIỆU</small><strong>ĐÃ PHÁT HÀNH</strong></div>
            <div><small>CẬP NHẬT</small><strong>{batchDate(publishedRelease.updatedAt)}</strong><span>Tự động / Admin</span></div>
            <div className="release-row__actions"><button onClick={() => window.open(`${window.location.href.split('#')[0]}#/tv`, '_blank', 'noopener,noreferrer')}><Eye size={16} /> Mở TV</button></div>
          </article>
        ) : <section className="panel"><div className="board-empty-state"><PackageCheck size={34} /><strong>Chưa có bản phát hành thật để hiển thị</strong><span>{publishedError || 'Đang tải dữ liệu từ Supabase.'}</span></div></section>}
      </div>
      <section className="panel audit-panel"><PanelHeader eyebrow="NGUYÊN TẮC AN TOÀN" title="Mọi thay đổi đều có thể truy vết" /><div className="audit-features"><div><ShieldCheck /><strong>Không ghi đè bản đang chạy</strong><span>Mỗi lần duyệt tạo version mới.</span></div><div><History /><strong>Quay lui trong một chạm</strong><span>TV giữ tối thiểu một bản trước.</span></div><div><Wifi /><strong>Không bỏ lỡ lệnh</strong><span>Broadcast + desired release khi reconnect.</span></div></div></section>
    </>
  )
}

function SettingsPage({ notify }: { notify: (message: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSignedInEmail(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const supabase = getSupabase()
    if (!supabase) return notify('Hãy cấu hình Supabase trong .env.local trước.')
    setAuthBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setAuthBusy(false)
    if (error) return notify(`Đăng nhập thất bại: ${error.message}`)
    setPassword('')
    notify('Đã đăng nhập Supabase. Có thể đồng bộ Sheet thật.')
  }

  const signOut = async () => {
    const supabase = getSupabase()
    if (!supabase) return
    setAuthBusy(true)
    const { error } = await supabase.auth.signOut()
    setAuthBusy(false)
    notify(error ? `Không thể đăng xuất: ${error.message}` : 'Đã đăng xuất Supabase.')
  }

  return (
    <div className="settings-grid">
      <section className="panel settings-card"><div className="settings-card__title"><span><DatabaseZap size={21} /></span><div><h3>Supabase Backend</h3><p>Database, Realtime, Storage và Edge Functions</p></div><StatusPill tone={signedInEmail ? 'success' : 'warning'}>{signedInEmail ? 'ĐÃ ĐĂNG NHẬP' : isSupabaseConfigured ? 'CHỜ ĐĂNG NHẬP' : 'CHƯA CẤU HÌNH'}</StatusPill></div><div className="settings-lines"><div><span>Project URL</span><code>{isSupabaseConfigured ? 'Đã nạp từ VITE_SUPABASE_URL' : 'Chưa cấu hình trong .env.local'}</code></div><div><span>Realtime</span><strong>Broadcast + Presence</strong></div><div><span>Storage buckets</span><strong>employee-photos · vinhdanh-media</strong></div></div>{isSupabaseConfigured ? signedInEmail ? <div className="auth-session"><div><span>Phiên Admin</span><strong>{signedInEmail}</strong></div><button className="button button--secondary" onClick={signOut} disabled={authBusy}>Đăng xuất</button></div> : <form className="auth-form" onSubmit={signIn}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email Admin" autoComplete="username" required /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" autoComplete="current-password" required /><button className="button button--gold" type="submit" disabled={authBusy}>{authBusy ? 'Đang đăng nhập…' : 'Đăng nhập Admin'}</button></form> : <button className="button button--secondary" onClick={() => notify('Sao chép .env.example thành .env.local để kết nối dự án thật.')}><Settings2 size={16} /> Hướng dẫn kết nối</button>}</section>
      <section className="panel settings-card"><div className="settings-card__title"><span><FileSpreadsheet size={21} /></span><div><h3>Google Sheet nguồn</h3><p>Kết quả đã xếp hạng từ HR & kế toán</p></div><StatusPill tone="success">ĐÃ CHỌN</StatusPill></div><div className="settings-lines"><div><span>Sheet ID</span><code>{sheetSourceId.slice(0, 18)}…</code></div><div><span>Trạng thái đọc</span><strong>FINAL vẫn cho phép cập nhật</strong></div><div><span>Chính sách</span><strong>Admin duyệt trước khi phát</strong></div></div><a className="button button--secondary" href={sourceSheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở Sheet</a></section>
      <section className="panel settings-card"><div className="settings-card__title"><span><MonitorSmartphone size={21} /></span><div><h3>Cấu hình TV Player</h3><p>Mặc định cho Web Player và Android TV</p></div></div><div className="settings-lines"><div><span>Độ phân giải</span><strong>1920 × 1080 · 16:9</strong></div><div><span>Video</span><strong>MP4 H.264 · bật âm thanh</strong></div><div><span>Offline</span><strong>Giữ bản hiện tại + bản trước</strong></div><div><span>Heartbeat</span><strong>Mỗi 30 giây</strong></div></div><button className="button button--secondary" onClick={() => notify('Đã lưu cài đặt player mặc định.')}><ShieldCheck size={16} /> Lưu cài đặt</button></section>
      <section className="panel settings-card"><div className="settings-card__title"><span><UsersRound size={21} /></span><div><h3>Phân quyền</h3><p>Vai trò vận hành đề xuất</p></div></div><div className="role-list"><div><span className="role-avatar">SA</span><p><strong>Super Admin</strong><small>Cấu hình, duyệt và phát hành</small></p></div><div><span className="role-avatar role-avatar--blue">HR</span><p><strong>HR / Kế toán</strong><small>Đồng bộ và xác nhận dữ liệu</small></p></div><div><span className="role-avatar role-avatar--green">CN</span><p><strong>Quản lý chi nhánh</strong><small>Xem trạng thái, không sửa kết quả</small></p></div></div><button className="button button--secondary" onClick={() => notify('Quản lý thành viên sẽ kết nối Supabase Auth.')}><UsersRound size={16} /> Quản lý thành viên</button></section>
    </div>
  )
}
