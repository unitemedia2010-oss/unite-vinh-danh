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
import { boards, branches, demoMeta, importRuns, releases, sourceSheetUrl } from '../data/mock'
import { saveCloudPlaylistDraft } from '../lib/cloudPlaylistSync'
import { formatVnd } from '../lib/format'
import { usePlaylistConfig } from '../lib/playlistConfig'
import { buildReleaseManifest } from '../lib/releaseManifest'
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

type Page = 'dashboard' | 'imports' | 'boards' | 'playlist' | 'devices' | 'releases' | 'settings'

const navItems: Array<{ id: Page; label: string; icon: typeof LayoutDashboard; badge?: string }> = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'imports', label: 'Dữ liệu Sheet', icon: DatabaseZap, badge: '2' },
  { id: 'boards', label: 'Bảng vinh danh', icon: Trophy },
  { id: 'playlist', label: 'Nội dung & Playlist', icon: ListVideo },
  { id: 'devices', label: 'Thiết bị TV', icon: MonitorSmartphone, badge: '9' },
  { id: 'releases', label: 'Bản phát hành', icon: PackageCheck },
  { id: 'settings', label: 'Cài đặt hệ thống', icon: Settings2 },
]

const pageTitles: Record<Page, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: 'GOOD MORNING, ADMIN', title: 'Trung tâm điều phối', description: 'Theo dõi dữ liệu, nội dung và 9 màn hình trong một nơi.' },
  imports: { eyebrow: 'NGUỒN DỮ LIỆU', title: 'Đồng bộ Google Sheet', description: 'Đọc bảng xếp hạng kế toán đã chốt, kiểm tra thay đổi trước khi duyệt.' },
  boards: { eyebrow: 'SNAPSHOT VINH DANH', title: 'Kiểm duyệt bảng vinh danh', description: 'Ưu tiên lô Supabase mới nhất; demo fallback luôn được ghi nhãn rõ ràng.' },
  playlist: { eyebrow: 'LỊCH PHÁT TOÀN HỆ THỐNG', title: 'Nội dung & Playlist', description: 'Sắp xếp vinh danh, video, sự kiện và thông báo theo ưu tiên.' },
  devices: { eyebrow: '9 CHI NHÁNH', title: 'Thiết bị & màn hình TV', description: 'Kiểm tra kết nối, phiên bản đang chạy và khả năng sẵn sàng.' },
  releases: { eyebrow: 'PHÁT HÀNH CÓ PHIÊN BẢN', title: 'Duyệt, phát và quay lui', description: 'Mỗi lần chỉnh sửa tạo một bản riêng, không ghi đè nội dung đang chạy.' },
  settings: { eyebrow: 'CẤU HÌNH HỆ THỐNG', title: 'Kết nối & quyền truy cập', description: 'Trạng thái Supabase, nguồn Sheet và cài đặt phát mặc định.' },
}

function HeaderActions({ onOpenScreen }: { onOpenScreen: () => void }) {
  return (
    <div className="header-actions">
      <button className="icon-button" title="Tìm kiếm"><Search size={18} /></button>
      <button className="icon-button has-alert" title="Thông báo"><Bell size={18} /><i /></button>
      <button className="button button--secondary button--screen" onClick={onOpenScreen}>
        <CirclePlay size={17} /> Mở màn hình TV <ArrowUpRight size={15} />
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

  const openScreen = () => {
    window.open(`${window.location.href.split('#')[0]}#/screen?branch=br-01&preview=1`, '_blank', 'noopener,noreferrer')
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
          {navItems.slice(0, 6).map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
                <Icon size={19} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}
              </button>
            )
          })}
          <small className="nav-label nav-label--spaced">HỆ THỐNG</small>
          {navItems.slice(6).map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.label}</span></button>
          })}
        </nav>
        <div className="sidebar__footer">
          <div className="system-health"><span className="pulse-dot" /><div><strong>Hệ thống hoạt động tốt</strong><small>7/9 TV sẵn sàng · {demoMeta.release}</small></div></div>
          <div className="sidebar__version">CONTROL CENTER <b>v0.1 MVP</b></div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Đóng điều hướng" />}

      <main className="admin-main">
        <header className="topbar">
          <div className="topbar__mobile"><button className="icon-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><Brand compact /></div>
          <HeaderActions onOpenScreen={openScreen} />
        </header>
        <div className="admin-content">
          <div className="page-heading">
            <div><p>{meta.eyebrow}</p><h1>{meta.title}</h1><span>{meta.description}</span></div>
            <div className="page-heading__pilot"><Radio size={16} /><div><small>PILOT ĐANG CHỌN</small><strong>125 Trần Bình Trọng</strong></div></div>
          </div>

          {page === 'dashboard' && <DashboardPage navigate={navigate} notify={notify} />}
          {page === 'imports' && <ImportsPage notify={notify} />}
          {page === 'boards' && <BoardsPage notify={notify} />}
          {page === 'playlist' && <PlaylistPage notify={notify} />}
          {page === 'devices' && <DevicesPage openScreen={openScreen} notify={notify} />}
          {page === 'releases' && <ReleasesPage notify={notify} />}
          {page === 'settings' && <SettingsPage notify={notify} />}
        </div>
      </main>
      {toast && <div className="toast"><CircleCheckBig size={18} /><span>{toast}</span></div>}
    </div>
  )
}

function DashboardPage({ navigate, notify }: { navigate: (page: Page) => void; notify: (message: string) => void }) {
  const liveBoard = boards.find((board) => board.id === 'leader-ky-lan')!
  return (
    <>
      <section className="release-hero">
        <div className="release-hero__glow" />
        <div className="release-hero__copy">
          <StatusPill tone="gold"><Radio size={12} /> DEMO ĐANG PHÁT</StatusPill>
          <h2>Vinh danh tháng 08 <span>· Bản {demoMeta.release}</span></h2>
          <p>Đủ 9 bảng mẫu để duyệt giao diện. Số liệu FINAL sẽ thay thế sau khi kế toán chốt.</p>
          <div className="release-hero__actions">
            <button className="button button--gold" onClick={() => navigate('releases')}><Rocket size={17} /> Xem bản phát hành</button>
            <button className="button button--ghost" onClick={() => navigate('playlist')}><ListVideo size={17} /> Chỉnh playlist</button>
          </div>
        </div>
        <div className="release-meter">
          <div className="release-meter__ring"><strong>7</strong><span>/ 9 TV</span></div>
          <p><b>Đã nhận bản mới</b><span>CN05 đang tải · CN08 offline</span></p>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={MonitorSmartphone} label="Màn hình online" value="7 / 9" detail="1 cảnh báo · 1 offline" tone="success" trend="+1 hôm nay" />
        <MetricCard icon={FileSpreadsheet} label="Dữ liệu demo tháng 08" value="69" detail="lượt xếp hạng trong 9 bảng" tone="info" trend="DEMO" />
        <MetricCard icon={Trophy} label="Bảng đã có dữ liệu" value="9 / 9" detail="đủ QLCN, Leader, Sale và Team" tone="gold" trend="100%" />
        <MetricCard icon={CalendarClock} label="Nội dung kế tiếp" value="08/08" detail="Kick-off tháng 08 · 08:00" tone="purple" trend="Đã tải" />
      </section>

      <div className="content-grid content-grid--dashboard">
        <section className="panel branch-panel">
          <PanelHeader eyebrow="THIẾT BỊ THEO CHI NHÁNH" title="Sức khỏe màn hình" action="Xem tất cả" onAction={() => navigate('devices')} />
          <div className="branch-mini-grid">
            {branches.map((branch) => (
              <button className={`branch-mini branch-mini--${branch.health}`} key={branch.id} onClick={() => navigate('devices')}>
                <div className="branch-mini__head"><span>{branch.code}</span><HealthIcon state={branch.health} /></div>
                <strong>{branch.pilot ? '125 TBT · Pilot' : branch.name}</strong>
                <small>{branch.lastSeen}</small>
                <div><i /><span>{branch.release}</span></div>
              </button>
            ))}
          </div>
          <div className="panel-note"><ShieldCheck size={17} /><span>Màn hình offline vẫn tiếp tục phát bản gần nhất đã tải về.</span></div>
        </section>

        <section className="panel activity-panel">
          <PanelHeader eyebrow="HOẠT ĐỘNG GẦN ĐÂY" title="Luồng vận hành" />
          <div className="activity-list">
            <ActivityItem icon={Rocket} tone="gold" title={`Minh Admin phát hành demo ${demoMeta.release}`} meta="Toàn hệ thống · 12 phút trước" />
            <ActivityItem icon={PencilLine} tone="blue" title="Sửa doanh số hiển thị Anh Tuấn" meta={`${formatVnd(156000000)} · 18 phút trước`} />
            <ActivityItem icon={DatabaseZap} tone="green" title="Bộ dữ liệu demo T08 đã sẵn sàng" meta="69 lượt xếp hạng · 9 bảng · 24 phút trước" />
            <ActivityItem icon={CloudOff} tone="red" title="CN08 mất kết nối" meta="Đang phát R07.2 từ bộ nhớ · 2 giờ trước" />
          </div>
          <button className="panel-link" onClick={() => notify('Đã mở nhật ký hệ thống (dữ liệu mô phỏng).')}><History size={16} /> Xem toàn bộ nhật ký <ArrowRight size={15} /></button>
        </section>
      </div>

      <section className="panel snapshot-panel">
        <PanelHeader eyebrow="XEM NHANH NỘI DUNG" title="Bảng Kỳ Lân · Leader từ 200 triệu" action="Kiểm duyệt bảng" onAction={() => navigate('boards')} />
        <div className="snapshot-layout">
          <div className="snapshot-podium">
            {[liveBoard.honorees[1], liveBoard.honorees[0], liveBoard.honorees[2]].map((person) => (
              <div className={`snapshot-person rank-${person.rank}`} key={person.name}>
                <span className="snapshot-rank">#{person.rank}</span><Avatar person={person} size="lg" glow={person.rank === 1} />
                <strong>{person.shortName}</strong><small>{person.team}</small><b>{formatVnd(person.revenue)}</b>
              </div>
            ))}
          </div>
          <div className="snapshot-list">
            {liveBoard.honorees.slice(3, 10).map((person) => (
              <div key={person.rank}><span>{String(person.rank).padStart(2, '0')}</span><Avatar person={person} size="sm" /><p><strong>{person.shortName}</strong><small>{person.team}</small></p><b>{formatVnd(person.revenue)}</b></div>
            ))}
          </div>
        </div>
      </section>
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
      notify(isSupabaseConfigured ? `Không thể đồng bộ: ${result.error.message}` : 'Đang mock mode; chưa kết nối Supabase.')
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
          {!latest && <div className="warning-card"><span><CloudOff size={19} /></span><div><strong>{loadError || 'Chưa có dữ liệu thật'}</strong><p>Đăng nhập Supabase rồi bấm Đồng bộ ngay.</p><small>UI demo không được dùng để tạo bản phát hành thật.</small></div></div>}
          {latest && latest.status !== 'validated' ? <div className="warning-summary warning-summary--blocked"><ShieldCheck size={18} /><p><strong>RPC duyệt an toàn dành cho Admin có quyền</strong><span>Lô có cảnh báo bắt buộc nhập ghi chú; server kiểm tra lại số cảnh báo trước khi cập nhật.</span></p><button className="button button--gold" onClick={() => void approveLatest()} disabled={approving}>{approving ? 'Đang duyệt…' : 'Duyệt lô mới nhất'}</button></div> : latest && <div className="warning-summary"><ShieldCheck size={18} /><p><strong>Lô đã được xác thực</strong><span>Có thể dùng để tạo bản READY.</span></p></div>}
        </section>
      </div>

      <section className="panel table-panel">
        <PanelHeader eyebrow={batches.length ? 'LỊCH SỬ SUPABASE' : 'FALLBACK MINH HỌA'} title={batches.length ? 'Các lô import thật gần nhất' : 'Chưa có dữ liệu thật · đang hiển thị mock'} />
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Mã lô</th><th>Thời gian</th><th>Kỳ dữ liệu</th><th>Trạng thái</th><th>Bản ghi</th><th>Nguồn</th><th>Thực hiện</th><th /></tr></thead><tbody>
          {(batches.length ? batches.map((batch) => ({ id: `#${batch.sequence}`, createdAt: batchDate(batch.importedAt), period: batch.periodId, state: batch.status, records: batch.rowCount, warnings: batch.warningCount, sourceVersion: batch.sourceHash.slice(0, 10), actor: batch.importedBy ? 'Admin' : 'Lịch tự động' })) : importRuns).map((run) => {
            const stateLabel = run.state === 'final' ? 'FINAL' : run.state === 'demo' ? 'DEMO' : 'CẢNH BÁO'
            const realState = batches.length ? batchStatus(run.state as RecognitionImportBatch['status']) : null
            const stateTone = realState?.tone ?? (run.state === 'final' ? 'success' : run.state === 'demo' ? 'info' : 'warning')
            return <tr key={run.id}><td><strong>{run.id}</strong></td><td>{run.createdAt}</td><td>{run.period}</td><td><StatusPill tone={stateTone}>{realState?.label ?? stateLabel}</StatusPill></td><td>{run.records} <small>· {run.warnings} cảnh báo</small></td><td>{run.sourceVersion}</td><td>{run.actor}</td><td><button className="row-action"><MoreHorizontal size={17} /></button></td></tr>
          })}
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
    if (!snapshot?.boards.length) return boards
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
  const [overrideValues, setOverrideValues] = useState<Record<string, number>>({})
  const selected = available.find((board) => board.id === selectedId) || available[0]
  const overrideIndex = Math.min(8, selected.honorees.length - 1)
  const overrideValue = overrideValues[selected.id]
  const previewHonorees = selected.honorees.map((person, index) => index === overrideIndex && overrideValue ? { ...person, revenue: overrideValue } : person)
  const overridePerson = previewHonorees[overrideIndex]

  useEffect(() => { if (available[0]) setSelectedId(available[0].id) }, [available])

  const toggleDemoOverride = () => {
    if (usingLiveData) {
      notify('Đây là snapshot thật chỉ đọc. Hãy sửa bằng quy trình manual override có audit, không sửa trực tiếp kết quả Sheet.')
      return
    }
    if (overrideIndex < 0) return
    if (overrideValue) {
      setOverrideValues((current) => {
        const next = { ...current }
        delete next[selected.id]
        return next
      })
      notify(`Đã hoàn tác ghi đè của bảng ${selected.title}.`)
      return
    }
    setOverrideValues((current) => ({ ...current, [selected.id]: selected.honorees[overrideIndex].revenue + 1000000 }))
    notify(`Đã cộng 1.000.000 VNĐ vào hạng ${overrideIndex + 1} trên bản demo; Sheet nguồn không thay đổi.`)
  }

  return (
    <>
      <div className="board-toolbar">
        <div className="segmented-control">
          {([['manager', 'Quản lý CN'], ['leader', 'Leader'], ['fulltime', 'Sale Full-time'], ['parttime', 'Sale Part-time'], ['team', 'Team']] as const).map(([id, label]) => <button className={group === id ? 'active' : ''} onClick={() => setGroup(id)} key={id}>{label}</button>)}
        </div>
        <div className="board-toolbar__actions"><StatusPill tone={usingLiveData ? snapshot?.batch.status === 'validated' ? 'success' : 'warning' : 'info'}>{usingLiveData ? `SUPABASE · ${snapshot?.batch.status.toUpperCase()}` : loading ? 'ĐANG TẢI SUPABASE' : 'DEMO FALLBACK'}</StatusPill><button className="button button--secondary" onClick={() => notify(usingLiveData ? `Nguồn ${selected.sourceRange}.` : `Fallback demo: ${loadError || 'chưa có lô thật'}.`)}><SlidersHorizontal size={16} /> Xem nguồn</button><button className="button button--gold" onClick={() => notify(snapshot?.batch.status === 'validated' ? `Lô #${snapshot.batch.sequence} đã được duyệt.` : 'Duyệt toàn bộ lô tại trang Dữ liệu Sheet trước khi phát hành.')}><ShieldCheck size={16} /> Trạng thái duyệt</button></div>
      </div>

      {available.length > 1 && <div className="subtabs">{available.map((board) => <button className={selected.id === board.id ? 'active' : ''} onClick={() => setSelectedId(board.id)} key={board.id}><span>{board.title}</span><small>{board.threshold}</small></button>)}</div>}

      <div className="board-review-grid">
        <section className="board-preview">
          <div className="board-preview__ambient" />
          <div className="board-preview__header"><Brand /><span>{usingLiveData ? `DỮ LIỆU THẬT · ${periodLabel(snapshot!.batch.periodId).toUpperCase()}` : `DEMO FALLBACK · VINH DANH THÁNG ${demoMeta.month} · ${demoMeta.year}`}</span></div>
          <div className="board-preview__title"><small>{selected.subtitle}</small><h2>{selected.title}</h2><p>{selected.threshold}</p></div>
          <div className="preview-layout">
            {previewHonorees.length ? <>
              <div className="preview-podium">
                {[previewHonorees[1], previewHonorees[0], previewHonorees[2]].filter(Boolean).map((person) => (
                  <div className={`preview-person preview-person--${person.rank}`} key={person.name}><span className="preview-medal">{person.rank === 1 ? <Crown /> : <Medal />}</span><Avatar person={person} size="xl" glow={person.rank === 1} /><i>HẠNG {person.rank}</i><strong>{person.shortName}</strong><small>{person.team}</small><b>{formatVnd(person.revenue)}</b></div>
                ))}
              </div>
              {previewHonorees.length > 3 && <div className="preview-ranking"><h3>TOP 10 XUẤT SẮC</h3>{previewHonorees.slice(3, 10).map((person) => <div key={person.rank}><span>{person.rank}</span><Avatar person={person} size="sm" /><p><strong>{person.shortName}</strong><small>{person.team}</small></p><b>{formatVnd(person.revenue)}</b></div>)}</div>}
            </> : <div className="board-empty-state"><Trophy size={34} /><strong>Chưa có QLCN đạt hạng này</strong><span>Sheet hiện không có kết quả từ 500.000.000 VNĐ trở lên.</span></div>}
          </div>
          <div className="board-preview__footer"><span>UNITE GROUP · NÂNG TẦM CUỘC SỐNG</span><i>•</i><span>Nguồn {selected.sourceRange}</span></div>
        </section>

        <aside className="review-sidebar">
          <div className="review-card"><div className="review-card__head"><span>THÔNG TIN BẢNG</span><StatusPill tone={usingLiveData ? 'success' : 'info'}>{usingLiveData ? 'SNAPSHOT SUPABASE' : 'DEMO FALLBACK'}</StatusPill></div><dl><div><dt>Nguồn kiểm tra</dt><dd>{selected.sourceRange}</dd></div><div><dt>Số hạng</dt><dd>{selected.honorees.length}</dd></div><div><dt>Avatar có sẵn</dt><dd>{selected.honorees.filter((person) => person.photoUrl).length}/{selected.honorees.length}</dd></div><div><dt>Ghi đè Admin</dt><dd>{usingLiveData ? 'Chỉ đọc' : overrideValue ? '1 trường' : '0 trường'}</dd></div><div><dt>Thời lượng</dt><dd>{selected.honorees.length > 3 ? '18 giây' : '14 giây'}</dd></div></dl></div>
          <div className="review-card"><div className="review-card__head"><span>{usingLiveData ? 'ĐỐI SOÁT SNAPSHOT' : 'CHỈNH SỬA DEMO'}</span><button onClick={toggleDemoOverride} disabled={usingLiveData || !overridePerson}><PencilLine size={15} /> {usingLiveData ? 'Chỉ đọc' : overrideValue ? 'Hoàn tác' : 'Thử ghi đè'}</button></div>{overridePerson ? <div className="override-item"><Avatar person={overridePerson} size="sm" /><div><strong>{overridePerson.name}</strong><small>Doanh số hiển thị{overrideValue ? ' · Đã ghi đè' : ''}</small><b>{formatVnd(overridePerson.revenue)}</b></div><button title="Tùy chọn ghi đè"><MoreHorizontal size={16} /></button></div> : <p className="helper-text"><CloudOff size={15} /> Bảng này chưa có kết quả trong lô mới nhất.</p>}<p className="helper-text"><ShieldCheck size={15} /> {usingLiveData ? 'Kết quả lấy từ award_results, không sửa trực tiếp tại màn hình này.' : `Fallback chỉ để xem giao diện, không được phát hành (${loadError || 'chưa có lô Supabase'}).`}</p></div>
          <button className="button button--wide button--secondary" onClick={() => window.open(`${window.location.href.split('#')[0]}#/screen?board=${selected.id}&preview=1`, '_blank')}><Eye size={17} /> Xem toàn màn hình TV</button>
        </aside>
      </div>
    </>
  )
}

function PlaylistPage({ notify }: { notify: (message: string) => void }) {
  return <PlaylistEditorPage notify={notify} />
}

function DevicesPage({ openScreen, notify }: { openScreen: () => void; notify: (message: string) => void }) {
  const [pairingOpen, setPairingOpen] = useState(false)
  const [pairingCode, setPairingCode] = useState('')
  const [screenId, setScreenId] = useState('')
  const [screenOptions, setScreenOptions] = useState<ScreenOption[]>([])
  const [registrations, setRegistrations] = useState<DeviceRegistration[]>([])
  const [pairingBusy, setPairingBusy] = useState(false)
  const counts = { online: branches.filter((b) => b.health === 'online').length, warning: branches.filter((b) => b.health === 'warning').length, offline: branches.filter((b) => b.health === 'offline').length }

  const refreshPairing = async () => {
    if (!isSupabaseConfigured) return
    setPairingBusy(true)
    try {
      const data = await loadPairingConsole()
      setScreenOptions(data.screens)
      setRegistrations(data.registrations)
      setScreenId((current) => current || data.screens[0]?.id || '')
    } catch (error) {
      notify(`Không tải được pairing: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setPairingBusy(false)
    }
  }

  useEffect(() => {
    if (pairingOpen) void refreshPairing()
  }, [pairingOpen])

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
    if (!isSupabaseConfigured) return notify('Đang mock mode. Hãy cấu hình và đăng nhập Supabase trước khi ghép TV thật.')
    setPairingOpen((value) => !value)
  }

  return (
    <>
      <section className="device-summary"><div><span className="device-summary__icon"><MonitorSmartphone size={28} /></span><div><h2>{counts.online} thiết bị đang online</h2><p>1 thiết bị cần tải bản mới · 1 thiết bị đang phát offline</p></div></div><div className="health-legend"><span className="online"><i />{counts.online} Online</span><span className="warning"><i />{counts.warning} Cảnh báo</span><span className="offline"><i />{counts.offline} Offline</span></div><button className="button button--gold" onClick={togglePairing}><Link2 size={16} /> {pairingOpen ? 'Đóng pairing' : 'Ghép nối TV'}</button></section>
      {pairingOpen && <section className="panel pairing-console"><div className="pairing-console__head"><div><span>GHÉP NỐI THIẾT BỊ THẬT</span><h3>Nhập mã đang hiện trên TV</h3><p>Admin chọn đúng màn hình/chi nhánh rồi duyệt. Mã hết hạn sau 30 phút.</p></div><button className="button button--secondary" onClick={refreshPairing} disabled={pairingBusy}><RefreshCw size={15} className={pairingBusy ? 'spin' : ''} /> Làm mới</button></div><form onSubmit={approve}><input value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Mã 6 số" aria-label="Mã pairing" required /><select value={screenId} onChange={(event) => setScreenId(event.target.value)} required><option value="">Chọn màn hình</option>{screenOptions.map((screen) => <option value={screen.id} key={screen.id}>{screen.screen_code} · {screen.name}</option>)}</select><button className="button button--gold" type="submit" disabled={pairingBusy || pairingCode.length !== 6 || !screenId}>Duyệt thiết bị</button></form><div className="pending-devices"><strong>Đang chờ duyệt</strong>{registrations.filter((item) => item.status === 'pending').length ? registrations.filter((item) => item.status === 'pending').map((item) => <button key={item.id} onClick={() => setPairingCode(item.pairing_code)}><span>{item.pairing_code.replace(/(\d{3})(\d{3})/, '$1 $2')}</span><small>{item.device_name || item.device_id} · {item.app_version || 'chưa rõ version'}</small></button>) : <p>Chưa có TV nào gửi yêu cầu ghép nối.</p>}</div></section>}
      <div className="device-grid">
        {branches.map((branch) => (
          <article className={`device-card device-card--${branch.health}`} key={branch.id}>
            <div className="device-card__top"><div className="device-card__screen"><MonitorSmartphone size={29} /><span>{branch.code}</span></div><StatusPill tone={branch.health === 'online' ? 'success' : branch.health === 'warning' ? 'warning' : 'danger'}>{branch.health === 'online' ? 'ONLINE' : branch.health === 'warning' ? 'CẢNH BÁO' : 'OFFLINE'}</StatusPill></div>
            <div className="device-card__title"><h3>{branch.name}</h3>{branch.pilot && <em>PILOT</em>}<p><MapPin size={14} />{branch.address}</p></div>
            <dl><div><dt>Thiết bị</dt><dd>{branch.deviceName}</dd></div><div><dt>Nền tảng</dt><dd>{branch.platform}</dd></div><div><dt>Phiên bản</dt><dd><b>{branch.release}</b>{branch.ready ? <span className="text-success">Sẵn sàng</span> : <span className="text-warning">Cần cập nhật</span>}</dd></div><div><dt>Liên lạc cuối</dt><dd>{branch.lastSeen}</dd></div></dl>
            <div className="device-card__footer"><button onClick={branch.pilot ? openScreen : () => notify(`Đã gửi lệnh mở player đến ${branch.code} (mô phỏng).`)}><Eye size={16} />Xem player</button><button onClick={() => notify(`Đã gửi lệnh tải lại đến ${branch.code}.`)}><RefreshCw size={16} />Tải lại</button><button><MoreHorizontal size={17} /></button></div>
          </article>
        ))}
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
        <div className="readiness-track"><div><span style={{ width: '77.78%' }} /></div><p><b>77,8%</b><span>7 sẵn sàng · 1 đang tải · 1 offline</span></p></div>
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
        {releases.map((release) => (
          <article className={`release-row release-row--${release.state}`} key={release.id}>
            <span className="release-row__icon"><ReleaseIcon state={release.state} /></span>
            <div className="release-row__version"><strong>{release.version}</strong><StatusPill tone={release.state === 'live' ? 'success' : release.state === 'scheduled' ? 'info' : 'neutral'}>{release.state === 'live' ? 'ĐANG PHÁT' : release.state === 'scheduled' ? 'ĐÃ LÊN LỊCH' : 'LƯU TRỮ'}</StatusPill></div>
            <div className="release-row__copy"><strong>{release.label}</strong><small>{release.changed}</small></div>
            <div><small>TRẠNG THÁI TV</small><strong>{release.ready}</strong></div>
            <div><small>PHÁT HÀNH</small><strong>{release.publishedAt}</strong><span>{release.actor}</span></div>
            <div className="release-row__actions">{release.state === 'archived' && <button onClick={() => notify(`Đã tạo bản nháp quay lui từ ${release.version}.`)}><History size={16} /> Khôi phục</button>}<button><MoreHorizontal size={18} /></button></div>
          </article>
        ))}
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
      <section className="panel settings-card"><div className="settings-card__title"><span><DatabaseZap size={21} /></span><div><h3>Supabase Backend</h3><p>Database, Realtime, Storage và Edge Functions</p></div><StatusPill tone={signedInEmail ? 'success' : 'warning'}>{signedInEmail ? 'ĐÃ ĐĂNG NHẬP' : isSupabaseConfigured ? 'CHỜ ĐĂNG NHẬP' : 'MOCK MODE'}</StatusPill></div><div className="settings-lines"><div><span>Project URL</span><code>{isSupabaseConfigured ? 'Đã nạp từ VITE_SUPABASE_URL' : 'Chưa cấu hình trong .env.local'}</code></div><div><span>Realtime</span><strong>Broadcast + Presence</strong></div><div><span>Storage buckets</span><strong>employee-photos · vinhdanh-media</strong></div></div>{isSupabaseConfigured ? signedInEmail ? <div className="auth-session"><div><span>Phiên Admin</span><strong>{signedInEmail}</strong></div><button className="button button--secondary" onClick={signOut} disabled={authBusy}>Đăng xuất</button></div> : <form className="auth-form" onSubmit={signIn}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email Admin" autoComplete="username" required /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu" autoComplete="current-password" required /><button className="button button--gold" type="submit" disabled={authBusy}>{authBusy ? 'Đang đăng nhập…' : 'Đăng nhập Admin'}</button></form> : <button className="button button--secondary" onClick={() => notify('Sao chép .env.example thành .env.local để kết nối dự án thật.')}><Settings2 size={16} /> Hướng dẫn kết nối</button>}</section>
      <section className="panel settings-card"><div className="settings-card__title"><span><FileSpreadsheet size={21} /></span><div><h3>Google Sheet nguồn</h3><p>Kết quả đã xếp hạng từ HR & kế toán</p></div><StatusPill tone="success">ĐÃ CHỌN</StatusPill></div><div className="settings-lines"><div><span>Sheet ID</span><code>{sheetSourceId.slice(0, 18)}…</code></div><div><span>Trạng thái đọc</span><strong>FINAL vẫn cho phép cập nhật</strong></div><div><span>Chính sách</span><strong>Admin duyệt trước khi phát</strong></div></div><a className="button button--secondary" href={sourceSheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Mở Sheet</a></section>
      <section className="panel settings-card"><div className="settings-card__title"><span><MonitorSmartphone size={21} /></span><div><h3>Cấu hình TV Player</h3><p>Mặc định cho Web Player và Android TV</p></div></div><div className="settings-lines"><div><span>Độ phân giải</span><strong>1920 × 1080 · 16:9</strong></div><div><span>Video</span><strong>MP4 H.264 · bật âm thanh</strong></div><div><span>Offline</span><strong>Giữ bản hiện tại + bản trước</strong></div><div><span>Heartbeat</span><strong>Mỗi 30 giây</strong></div></div><button className="button button--secondary" onClick={() => notify('Đã lưu cài đặt player mặc định.')}><ShieldCheck size={16} /> Lưu cài đặt</button></section>
      <section className="panel settings-card"><div className="settings-card__title"><span><UsersRound size={21} /></span><div><h3>Phân quyền</h3><p>Vai trò vận hành đề xuất</p></div></div><div className="role-list"><div><span className="role-avatar">SA</span><p><strong>Super Admin</strong><small>Cấu hình, duyệt và phát hành</small></p></div><div><span className="role-avatar role-avatar--blue">HR</span><p><strong>HR / Kế toán</strong><small>Đồng bộ và xác nhận dữ liệu</small></p></div><div><span className="role-avatar role-avatar--green">CN</span><p><strong>Quản lý chi nhánh</strong><small>Xem trạng thái, không sửa kết quả</small></p></div></div><button className="button button--secondary" onClick={() => notify('Quản lý thành viên sẽ kết nối Supabase Auth.')}><UsersRound size={16} /> Quản lý thành viên</button></section>
    </div>
  )
}
