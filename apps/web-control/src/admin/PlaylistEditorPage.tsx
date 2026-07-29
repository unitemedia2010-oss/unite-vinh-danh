import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Clapperboard,
  CloudDownload,
  Copy,
  GripVertical,
  ImagePlus,
  ListVideo,
  Megaphone,
  MonitorPlay,
  Palette,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  X,
} from 'lucide-react'
import { Brand } from '../components/Brand'
import { StatusPill } from '../components/Status'
import { boards, branches } from '../data/mock'
import { getRecognitionVisualPreset } from '../data/recognitionPresets'
import {
  createPlaylistItem,
  defaultSchedule,
  usePlaylistConfig,
} from '../lib/playlistConfig'
import {
  deleteMediaAsset,
  storeImageAsset,
  storeVideoAsset,
  useMediaAssetUrl,
} from '../lib/mediaStore'
import {
  loadCloudPlaylistDraft,
  saveCloudPlaylistDraft,
} from '../lib/cloudPlaylistSync'
import { isSupabaseConfigured } from '../lib/supabase'
import type {
  BackgroundFit,
  BackgroundPosition,
  LogoEffect,
  LogoMode,
  LogoPosition,
  PlaylistConfig,
  PlaylistDraftItem,
  PlaylistKind,
  ScheduleWindow,
  SlideTransition,
} from '../types'

const kindLabels: Record<PlaylistKind, string> = {
  recognition: 'Bảng vinh danh',
  video: 'Video',
  event: 'Sự kiện',
  announcement: 'Thông báo',
}

const kindIcons = {
  recognition: Trophy,
  video: Clapperboard,
  event: CalendarClock,
  announcement: Megaphone,
}

const weekdayOptions = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

const formatCycle = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} phút ${seconds} giây`
}

const moveItem = (items: PlaylistDraftItem[], from: number, to: number) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

function WeekdayPicker({ schedule, onChange }: { schedule: ScheduleWindow; onChange: (next: ScheduleWindow) => void }) {
  const toggleDay = (day: number) => {
    const selected = schedule.weekdays.includes(day)
    const weekdays = selected ? schedule.weekdays.filter((value) => value !== day) : [...schedule.weekdays, day]
    onChange({ ...schedule, weekdays })
  }
  return (
    <div className="weekday-picker" aria-label="Chọn ngày trong tuần">
      {weekdayOptions.map((day) => (
        <button
          type="button"
          key={day.value}
          className={schedule.weekdays.includes(day.value) ? 'active' : ''}
          onClick={() => toggleDay(day.value)}
          aria-pressed={schedule.weekdays.includes(day.value)}
        >
          {day.label}
        </button>
      ))}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <label className={`editor-field ${wide ? 'editor-field--wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function PlaylistEditorPage({ notify }: { notify: (message: string) => void }) {
  const { config, setConfig, resetConfig } = usePlaylistConfig()
  const [selectedId, setSelectedId] = useState(config.items[0]?.id ?? '')
  const [newKind, setNewKind] = useState<PlaylistKind>('announcement')
  const [draggedId, setDraggedId] = useState('')
  const [uploading, setUploading] = useState('')
  const [cloudBusy, setCloudBusy] = useState<'load' | 'save' | ''>('')

  useEffect(() => {
    if (!config.items.some((item) => item.id === selectedId)) setSelectedId(config.items[0]?.id ?? '')
  }, [config.items, selectedId])

  const selectedIndex = Math.max(0, config.items.findIndex((item) => item.id === selectedId))
  const selected = config.items[selectedIndex]
  const uploadedBackgroundUrl = useMediaAssetUrl(selected?.backgroundAssetId)
  const uploadedLogoUrl = useMediaAssetUrl(selected?.logoAssetId)
  const uploadedMediaUrl = useMediaAssetUrl(selected?.mediaAssetId)
  const recognitionPreset = selected?.kind === 'recognition'
    ? getRecognitionVisualPreset(selected.boardId)
    : undefined
  const backgroundUrl = uploadedBackgroundUrl || selected?.backgroundUrl || recognitionPreset?.backgroundUrl || ''
  const logoUrl = uploadedLogoUrl || selected?.logoUrl || ''
  const mediaUrl = uploadedMediaUrl || selected?.mediaUrl || ''
  const enabledItems = config.items.filter((item) => item.enabled)
  const cycleSeconds = enabledItems.reduce((sum, item) => sum + item.duration, 0)

  const updateConfig = (updater: (current: PlaylistConfig) => PlaylistConfig) => setConfig((current) => updater(current))
  const updateSelected = (patch: Partial<PlaylistDraftItem>) => {
    if (!selected) return
    updateConfig((current) => ({
      ...current,
      items: current.items.map((item) => item.id === selected.id ? { ...item, ...patch } : item),
    }))
  }

  const reorder = (from: number, to: number) => {
    updateConfig((current) => ({ ...current, items: moveItem(current.items, from, to) }))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const from = config.items.findIndex((item) => item.id === draggedId)
    const to = config.items.findIndex((item) => item.id === targetId)
    reorder(from, to)
    setDraggedId('')
  }

  const addItem = () => {
    const item = createPlaylistItem(newKind)
    updateConfig((current) => ({ ...current, items: [...current.items, item] }))
    setSelectedId(item.id)
    notify(`Đã thêm ${kindLabels[newKind].toLowerCase()} mới vào cuối playlist.`)
  }

  const duplicateSelected = () => {
    if (!selected) return
    const duplicate: PlaylistDraftItem = {
      ...selected,
      id: `copy-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      title: `${selected.title} · Bản sao`,
    }
    updateConfig((current) => {
      const items = [...current.items]
      items.splice(selectedIndex + 1, 0, duplicate)
      return { ...current, items }
    })
    setSelectedId(duplicate.id)
    notify('Đã nhân bản trang cùng toàn bộ thiết lập.')
  }

  const deleteLocalAssetIfUnshared = (
    assetId: string | undefined,
    field: 'backgroundAssetId' | 'logoAssetId' | 'mediaAssetId',
  ) => {
    if (!assetId) return
    const shared = config.items.some(
      (item) => item.id !== selected?.id && item[field] === assetId,
    )
    if (!shared) void deleteMediaAsset(assetId)
  }

  const deleteSelected = () => {
    if (!selected) return
    if (config.items.length <= 1) {
      notify('Playlist cần giữ lại ít nhất một trang.')
      return
    }
    if (!window.confirm(`Xóa “${selected.title}” khỏi playlist?`)) return
    const nextId = config.items[selectedIndex + 1]?.id ?? config.items[selectedIndex - 1]?.id ?? ''
    updateConfig((current) => ({ ...current, items: current.items.filter((item) => item.id !== selected.id) }))
    setSelectedId(nextId)
    deleteLocalAssetIfUnshared(selected.backgroundAssetId, 'backgroundAssetId')
    deleteLocalAssetIfUnshared(selected.logoAssetId, 'logoAssetId')
    deleteLocalAssetIfUnshared(selected.mediaAssetId, 'mediaAssetId')
    notify('Đã xóa trang khỏi bản nháp.')
  }

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>, purpose: 'background' | 'logo') => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || !selected) return
    setUploading(purpose)
    try {
      const asset = await storeImageAsset(file, purpose)
      const oldId = purpose === 'background' ? selected.backgroundAssetId : selected.logoAssetId
      if (purpose === 'background') {
        updateSelected({ backgroundAssetId: asset.id, backgroundAssetName: asset.name })
      } else {
        updateSelected({ logoAssetId: asset.id, logoAssetName: asset.name, logoMode: 'custom' })
      }
      deleteLocalAssetIfUnshared(
        oldId,
        purpose === 'background' ? 'backgroundAssetId' : 'logoAssetId',
      )
      notify(`${purpose === 'background' ? 'Ảnh nền' : 'Logo'} đã được tối ưu và lưu riêng cho trang này.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể lưu hình ảnh.')
    } finally {
      setUploading('')
    }
  }

  const uploadVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || !selected) return
    setUploading('video')
    try {
      const asset = await storeVideoAsset(file)
      const oldId = selected.mediaAssetId
      updateSelected({ mediaAssetId: asset.id, mediaAssetName: asset.name })
      deleteLocalAssetIfUnshared(oldId, 'mediaAssetId')
      notify('Video đã được lưu trong bản nháp trên thiết bị này.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể lưu video.')
    } finally {
      setUploading('')
    }
  }

  const removeAsset = (type: 'background' | 'logo' | 'video') => {
    if (!selected) return
    const assetId = type === 'background' ? selected.backgroundAssetId : type === 'logo' ? selected.logoAssetId : selected.mediaAssetId
    if (type === 'background') updateSelected({ backgroundAssetId: undefined, backgroundAssetName: undefined })
    if (type === 'logo') updateSelected({ logoAssetId: undefined, logoAssetName: undefined, logoMode: 'default' })
    if (type === 'video') updateSelected({ mediaAssetId: undefined, mediaAssetName: undefined })
    deleteLocalAssetIfUnshared(
      assetId,
      type === 'background' ? 'backgroundAssetId' : type === 'logo' ? 'logoAssetId' : 'mediaAssetId',
    )
    notify('Đã gỡ media khỏi trang này.')
  }

  const updateKind = (kind: PlaylistKind) => {
    const board = boards[0]
    updateSelected({
      kind,
      boardId: kind === 'recognition' ? selected?.boardId ?? board.id : undefined,
      headline: kind === 'recognition' ? board.title : selected?.headline ?? '',
      subtitle: kind === 'recognition' ? board.subtitle : selected?.subtitle ?? '',
    })
  }

  const selectBoard = (boardId: string) => {
    const board = boards.find((candidate) => candidate.id === boardId)
    if (!board) return
    updateSelected({
      boardId,
      headline: board.title,
      subtitle: board.subtitle,
      meta: board.threshold,
      title: `Bảng · ${board.title}`,
      logoMode: selected?.logoMode === 'custom' && selected.logoAssetId ? 'custom' : 'default',
    })
  }

  const toggleBranch = (branchId: string) => {
    if (!selected) return
    const branchIds = selected.branchIds.includes(branchId)
      ? selected.branchIds.filter((id) => id !== branchId)
      : [...selected.branchIds, branchId]
    updateSelected({
      branchIds,
      audience: branchIds.length ? `${branchIds.length} chi nhánh` : 'Toàn hệ thống',
    })
  }

  const openPreview = () => {
    if (!selected) return
    const base = window.location.href.split('#')[0]
    window.open(`${base}#/tv?item=${encodeURIComponent(selected.id)}`, '_blank', 'noopener,noreferrer')
  }

  const reset = () => {
    if (!window.confirm('Đặt lại toàn bộ playlist, lịch, logo và ảnh nền về cấu hình mặc định?')) return
    resetConfig()
    setSelectedId('pl-01')
    notify('Đã đặt lại trình thiết lập về cấu hình mặc định.')
  }

  const saveDraft = async () => {
    if (!isSupabaseConfigured) {
      notify('Bản nháp đã tự lưu trên máy này. Hãy cấu hình Supabase để đồng bộ tới các TV.')
      return
    }
    setCloudBusy('save')
    try {
      const result = await saveCloudPlaylistDraft(config)
      notify(
        result.uploadedAssets
          ? `Đã lưu bản nháp lên Supabase và tải ${result.uploadedAssets} file media.`
          : 'Đã lưu bản nháp lên Supabase.',
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể lưu bản nháp lên Supabase.')
    } finally {
      setCloudBusy('')
    }
  }

  const loadDraft = async () => {
    if (!isSupabaseConfigured) {
      notify('Hãy cấu hình Supabase và đăng nhập Admin trước khi tải bản nháp Cloud.')
      return
    }
    setCloudBusy('load')
    try {
      const snapshot = await loadCloudPlaylistDraft(config.name)
      if (!snapshot) {
        notify(`Chưa có bản nháp “${config.name}” trên Supabase.`)
        return
      }
      setConfig(snapshot.config)
      setSelectedId(snapshot.config.items[0]?.id ?? '')
      notify(`Đã tải bản nháp “${snapshot.name}” từ Supabase.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể tải bản nháp từ Supabase.')
    } finally {
      setCloudBusy('')
    }
  }

  const previewStyle = useMemo(() => ({
    backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : undefined,
    backgroundSize: selected?.backgroundFit ?? 'cover',
    backgroundPosition: selected?.backgroundPosition ?? 'center',
    '--preview-overlay': String((selected?.overlayOpacity ?? 45) / 100),
  }) as CSSProperties, [backgroundUrl, selected?.backgroundFit, selected?.backgroundPosition, selected?.overlayOpacity])

  return (
    <>
      <section className="playlist-summary playlist-summary--editor">
        <div>
          <span className="playlist-summary__icon"><ListVideo size={24} /></span>
          <div>
            <StatusPill tone="gold"><Radio size={12} /> BẢN NHÁP ĐANG ĐỒNG BỘ</StatusPill>
            <h2>{config.name}</h2>
            <p>{enabledItems.length}/{config.items.length} trang đang bật · {formatCycle(cycleSeconds)} mỗi vòng · {config.repeat ? 'Lặp liên tục' : 'Phát một vòng'}</p>
          </div>
        </div>
        <div className="playlist-summary__actions">
          <button className="button button--secondary" onClick={reset}><RotateCcw size={16} /> Đặt lại</button>
          <button className="button button--secondary" onClick={openPreview}><MonitorPlay size={16} /> Xem bản TV đã phát hành</button>
          <button className="button button--secondary" onClick={() => void loadDraft()} disabled={Boolean(cloudBusy)}>
            <CloudDownload size={16} /> {cloudBusy === 'load' ? 'Đang tải…' : 'Tải từ Cloud'}
          </button>
          <button className="button button--gold" onClick={() => void saveDraft()} disabled={Boolean(cloudBusy)}>
            <Save size={16} /> {cloudBusy === 'save' ? 'Đang lưu…' : 'Lưu bản nháp'}
          </button>
        </div>
      </section>

      <div className="playlist-workbench">
        <section className="panel playlist-editor playlist-editor--full">
          <div className="playlist-editor__head">
            <div><span>THỨ TỰ PHÁT CHI TIẾT</span><h3>Nội dung trong một chu kỳ</h3></div>
            <div className="add-content-control">
              <select value={newKind} onChange={(event) => setNewKind(event.target.value as PlaylistKind)} aria-label="Loại nội dung mới">
                {Object.entries(kindLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <button className="button button--secondary" onClick={addItem}><Plus size={15} /> Thêm trang</button>
            </div>
          </div>
          <div className="playlist-items">
            {config.items.map((item, index) => {
              const Icon = kindIcons[item.kind]
              const active = item.id === selected?.id
              return (
                <div
                  className={`playlist-item playlist-item--editable ${active ? 'playlist-item--selected' : ''} ${!item.enabled ? 'playlist-item--disabled' : ''}`}
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, item.id)}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedId(item.id)
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                >
                  <span className="drag-handle" title="Kéo để sắp xếp"><GripVertical size={17} /></span>
                  <em>{String(index + 1).padStart(2, '0')}</em>
                  <span className={`playlist-item__icon playlist-item__icon--${item.kind}`}><Icon size={19} /></span>
                  <div className="playlist-item__copy">
                    <strong>{item.title}</strong>
                    <small>{item.headline} · {item.subtitle}</small>
                    <span>{item.branchIds.length ? `${item.branchIds.length} chi nhánh` : 'Toàn hệ thống'}{item.schedule?.enabled ? ' · Có lịch riêng' : ''}</span>
                  </div>
                  <div className="playlist-item__duration"><strong>{item.duration}s</strong><small>{item.transition} · {item.transitionDuration}s</small></div>
                  <div className="playlist-item__move">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); reorder(index, index - 1) }}
                      disabled={index === 0}
                      aria-label={`Đưa ${item.title} lên`}
                    ><ArrowUp size={14} /></button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); reorder(index, index + 1) }}
                      disabled={index === config.items.length - 1}
                      aria-label={`Đưa ${item.title} xuống`}
                    ><ArrowDown size={14} /></button>
                  </div>
                  <button
                    className={`toggle ${item.enabled ? 'active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      updateConfig((current) => ({
                        ...current,
                        items: current.items.map((candidate) => candidate.id === item.id ? { ...candidate, enabled: !candidate.enabled } : candidate),
                      }))
                    }}
                    aria-label={`${item.enabled ? 'Tắt' : 'Bật'} ${item.title}`}
                  ><i /></button>
                  <button
                    className="row-action"
                    onClick={(event) => { event.stopPropagation(); setSelectedId(item.id) }}
                    aria-label={`Chỉnh ${item.title}`}
                  ><Settings2 size={16} /></button>
                </div>
              )
            })}
          </div>
        </section>

        <aside className="playlist-inspector">
          {selected && (
            <>
              <section className="panel inspector-card inspector-card--preview">
                <div className="inspector-card__head">
                  <div><span>TRANG {String(selectedIndex + 1).padStart(2, '0')}</span><h3>Xem trước nội dung</h3></div>
                  <StatusPill tone={selected.enabled ? 'success' : 'neutral'}>{selected.enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}</StatusPill>
                </div>
                <div className={`slide-mini-preview logo-${selected.logoPosition}`} style={previewStyle}>
                  {selected.kind === 'video' && mediaUrl && <video className="slide-mini-preview__video" src={mediaUrl} muted autoPlay loop playsInline />}
                  <div className="slide-mini-preview__overlay" />
                  {selected.logoMode === 'default' && recognitionPreset?.badgeUrl ? (
                    <div className={`slide-mini-preview__board-badge slide-mini-preview__board-badge--${selected.logoEffect}`} style={{ '--logo-scale': selected.logoScale / 100 } as CSSProperties}>
                      <span />
                      <img src={recognitionPreset.badgeUrl} alt="" />
                    </div>
                  ) : selected.logoMode !== 'none' && (
                    <div className="slide-mini-preview__logo" style={{ '--logo-scale': selected.logoScale / 100 } as CSSProperties}>
                      {selected.logoMode === 'custom' && logoUrl ? <img src={logoUrl} alt="" /> : <Brand compact inverse />}
                    </div>
                  )}
                  <div className="slide-mini-preview__copy">
                    <span>{kindLabels[selected.kind]}</span>
                    <strong>{selected.headline}</strong>
                    <small>{selected.subtitle}</small>
                  </div>
                  <div className="slide-mini-preview__time">{selected.duration} GIÂY</div>
                </div>
                <button className="button button--wide button--secondary" onClick={openPreview}><MonitorPlay size={16} /> Mở bản TV đã phát hành</button>
              </section>

              <section className="panel inspector-card">
                <div className="inspector-card__head"><div><span>NỘI DUNG</span><h3>Thông tin hiển thị</h3></div><Palette size={18} /></div>
                <div className="editor-form-grid">
                  <Field label="Loại trang">
                    <select value={selected.kind} onChange={(event) => updateKind(event.target.value as PlaylistKind)}>
                      {Object.entries(kindLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </Field>
                  {selected.kind === 'recognition' && (
                    <Field label="Bảng dữ liệu">
                      <select value={selected.boardId} onChange={(event) => selectBoard(event.target.value)}>
                        {boards.map((board) => <option value={board.id} key={board.id}>{board.title} · {board.group}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label="Tên trong playlist" wide>
                    <input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} maxLength={80} />
                  </Field>
                  <Field label="Tiêu đề lớn trên TV" wide>
                    <input value={selected.headline} onChange={(event) => updateSelected({ headline: event.target.value })} maxLength={70} />
                  </Field>
                  <Field label="Phụ đề / mô tả" wide>
                    <textarea value={selected.subtitle} onChange={(event) => updateSelected({ subtitle: event.target.value })} rows={2} maxLength={180} />
                  </Field>
                  {selected.kind === 'announcement' && (
                    <Field label="Các dòng việc cần làm" hint="Mỗi dòng sẽ thành một mục riêng." wide>
                      <textarea value={selected.body} onChange={(event) => updateSelected({ body: event.target.value })} rows={4} />
                    </Field>
                  )}
                  {selected.kind === 'event' && (
                    <>
                      <Field label="Ngày sự kiện"><input type="date" value={selected.eventDate} onChange={(event) => updateSelected({ eventDate: event.target.value })} /></Field>
                      <Field label="Giờ bắt đầu"><input type="time" value={selected.eventTime} onChange={(event) => updateSelected({ eventTime: event.target.value })} /></Field>
                      <Field label="Địa điểm" wide><input value={selected.location} onChange={(event) => updateSelected({ location: event.target.value })} /></Field>
                    </>
                  )}
                </div>
              </section>

              <section className="panel inspector-card">
                <div className="inspector-card__head"><div><span>HÌNH ẢNH & LOGO</span><h3>Thiết kế riêng từng trang</h3></div><ImagePlus size={18} /></div>
                <div className="asset-control">
                  <div><strong>Ảnh nền của trang</strong><small>{selected.backgroundAssetName ?? (recognitionPreset?.backgroundLabel ?? 'Nền mặc định của hệ thống')}</small></div>
                  <div>
                    <label className="asset-upload-button"><Upload size={15} /> {uploading === 'background' ? 'Đang xử lý…' : 'Tải ảnh'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadImage(event, 'background')} /></label>
                    {selected.backgroundAssetId && <button onClick={() => removeAsset('background')} aria-label="Gỡ ảnh nền"><X size={15} /></button>}
                  </div>
                </div>
                <div className="editor-form-grid">
                  <Field label="Cách phủ ảnh">
                    <select value={selected.backgroundFit} onChange={(event) => updateSelected({ backgroundFit: event.target.value as BackgroundFit })}><option value="cover">Phủ kín màn hình</option><option value="contain">Hiện đủ ảnh</option></select>
                  </Field>
                  <Field label="Vị trí ảnh">
                    <select value={selected.backgroundPosition} onChange={(event) => updateSelected({ backgroundPosition: event.target.value as BackgroundPosition })}><option value="center">Chính giữa</option><option value="top">Ưu tiên phía trên</option><option value="bottom">Ưu tiên phía dưới</option></select>
                  </Field>
                  <Field label={`Lớp tối nền · ${selected.overlayOpacity}%`} wide>
                    <input type="range" min="0" max="85" value={selected.overlayOpacity} onChange={(event) => updateSelected({ overlayOpacity: Number(event.target.value) })} />
                  </Field>
                </div>
                <div className="asset-control">
                  <div>
                    <strong>Logo của trang</strong>
                    <small>{selected.logoMode === 'custom' ? selected.logoAssetName ?? 'Logo riêng' : selected.logoMode === 'none' ? 'Đã ẩn logo' : recognitionPreset?.badgeUrl ? `Huy hiệu ${recognitionPreset.badgeLabel}` : 'Logo Unite Group mặc định'}</small>
                    {selected.logoMode === 'default' && recognitionPreset?.badgeNote && <small className="asset-control__warning">{recognitionPreset.badgeNote}</small>}
                    {selected.logoMode === 'default' && selected.kind === 'recognition' && !recognitionPreset?.badgeUrl && <small className="asset-control__warning">Chưa có huy hiệu riêng; nền quyền lực vẫn được áp dụng.</small>}
                  </div>
                  <div>
                    <label className="asset-upload-button"><Upload size={15} /> {uploading === 'logo' ? 'Đang xử lý…' : 'Tải logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadImage(event, 'logo')} /></label>
                    {selected.logoAssetId && <button onClick={() => removeAsset('logo')} aria-label="Gỡ logo riêng"><X size={15} /></button>}
                  </div>
                </div>
                <div className="editor-form-grid">
                  <Field label="Chế độ logo">
                    <select value={selected.logoMode} onChange={(event) => updateSelected({ logoMode: event.target.value as LogoMode })}><option value="default">{recognitionPreset?.badgeUrl ? 'Huy hiệu theo bảng' : 'Logo mặc định'}</option><option value="custom" disabled={!selected.logoAssetId}>Logo đã tải</option><option value="none">Ẩn logo</option></select>
                  </Field>
                  <Field label="Vị trí logo">
                    <select value={selected.logoPosition} onChange={(event) => updateSelected({ logoPosition: event.target.value as LogoPosition })}><option value="top-left">Trên trái</option><option value="top-right">Trên phải</option><option value="bottom-left">Dưới trái</option><option value="bottom-right">Dưới phải</option></select>
                  </Field>
                  <Field label={`Kích thước logo · ${selected.logoScale}%`} wide>
                    <input type="range" min="60" max="160" step="5" value={selected.logoScale} onChange={(event) => updateSelected({ logoScale: Number(event.target.value) })} />
                  </Field>
                  <Field label="Hiệu ứng logo" wide>
                    <select value={selected.logoEffect} onChange={(event) => updateSelected({ logoEffect: event.target.value as LogoEffect })}><option value="royal">Quyền lực · hào quang và ánh quét</option><option value="pulse">Tỏa sáng nhẹ</option><option value="none">Tĩnh · không chuyển động</option></select>
                  </Field>
                </div>
                {selected.kind === 'video' && (
                  <>
                    <div className="asset-control">
                      <div><strong>Video của trang</strong><small>{selected.mediaAssetName ?? 'Có thể tải MP4/WebM hoặc nhập URL bên dưới'}</small></div>
                      <div>
                        <label className="asset-upload-button"><Upload size={15} /> {uploading === 'video' ? 'Đang lưu…' : 'Tải video'}<input type="file" accept="video/mp4,video/webm" onChange={(event) => void uploadVideo(event)} /></label>
                        {selected.mediaAssetId && <button onClick={() => removeAsset('video')} aria-label="Gỡ video"><X size={15} /></button>}
                      </div>
                    </div>
                    <div className="editor-form-grid">
                      <Field label="URL video công khai" hint="Dùng khi phát trên nhiều thiết bị." wide><input type="url" placeholder="https://..." value={selected.mediaUrl} onChange={(event) => updateSelected({ mediaUrl: event.target.value })} /></Field>
                      <label className="editor-check editor-field--wide"><input type="checkbox" checked={selected.audioEnabled} onChange={(event) => updateSelected({ audioEnabled: event.target.checked })} /><Volume2 size={16} /><span>Tự phát âm thanh khi thiết bị cho phép</span></label>
                    </div>
                  </>
                )}
              </section>

              <section className="panel inspector-card">
                <div className="inspector-card__head"><div><span>THỜI GIAN & HIỆU ỨNG</span><h3>Nhịp phát của trang</h3></div><CalendarClock size={18} /></div>
                <div className="editor-form-grid">
                  <Field label="Thời lượng (giây)" hint="Từ 5 đến 300 giây."><input type="number" min="5" max="300" value={selected.duration} onChange={(event) => updateSelected({ duration: Math.min(300, Math.max(5, Number(event.target.value) || 5)) })} /></Field>
                  <Field label="Hiệu ứng chuyển">
                    <select value={selected.transition} onChange={(event) => updateSelected({ transition: event.target.value as SlideTransition })}><option value="fade">Mờ dần</option><option value="slide">Trượt ngang</option><option value="zoom">Phóng nhẹ</option><option value="none">Không hiệu ứng</option></select>
                  </Field>
                  <Field label={`Thời gian chuyển · ${selected.transitionDuration.toFixed(1)}s`} wide><input type="range" min="0.2" max="2" step="0.1" value={selected.transitionDuration} onChange={(event) => updateSelected({ transitionDuration: Number(event.target.value) })} /></Field>
                  <label className="editor-check"><input type="checkbox" checked={selected.showHeader} onChange={(event) => updateSelected({ showHeader: event.target.checked })} /><Check size={15} /><span>Hiện thanh đầu trang</span></label>
                  <label className="editor-check"><input type="checkbox" checked={selected.showFooter} onChange={(event) => updateSelected({ showFooter: event.target.checked })} /><Check size={15} /><span>Hiện thanh cuối trang</span></label>
                </div>
              </section>

              <section className="panel inspector-card">
                <div className="inspector-card__head"><div><span>LỊCH & NƠI PHÁT</span><h3>Phạm vi riêng của trang</h3></div><Radio size={18} /></div>
                <div className="branch-targets">
                  <button className={selected.branchIds.length === 0 ? 'active' : ''} onClick={() => updateSelected({ branchIds: [], audience: 'Toàn hệ thống' })}>Tất cả 9 CN</button>
                  {branches.map((branch) => <button className={selected.branchIds.includes(branch.id) ? 'active' : ''} onClick={() => toggleBranch(branch.id)} key={branch.id}>{branch.code}</button>)}
                </div>
                <label className="editor-check editor-check--block">
                  <input type="checkbox" checked={Boolean(selected.schedule?.enabled)} onChange={(event) => updateSelected({ schedule: event.target.checked ? { ...defaultSchedule(), enabled: true } : undefined })} />
                  <CalendarClock size={16} /><span>Dùng lịch riêng cho trang này</span>
                </label>
                {selected.schedule?.enabled && (
                  <div className="editor-form-grid schedule-fields">
                    <Field label="Từ ngày"><input type="date" value={selected.schedule.startDate} onChange={(event) => updateSelected({ schedule: { ...selected.schedule!, startDate: event.target.value } })} /></Field>
                    <Field label="Đến ngày"><input type="date" value={selected.schedule.endDate} onChange={(event) => updateSelected({ schedule: { ...selected.schedule!, endDate: event.target.value } })} /></Field>
                    <Field label="Từ giờ"><input type="time" value={selected.schedule.dailyStart} onChange={(event) => updateSelected({ schedule: { ...selected.schedule!, dailyStart: event.target.value } })} /></Field>
                    <Field label="Đến giờ"><input type="time" value={selected.schedule.dailyEnd} onChange={(event) => updateSelected({ schedule: { ...selected.schedule!, dailyEnd: event.target.value } })} /></Field>
                    <div className="editor-field editor-field--wide"><span>Các ngày được phát</span><WeekdayPicker schedule={selected.schedule} onChange={(schedule) => updateSelected({ schedule })} /></div>
                  </div>
                )}
              </section>

              <section className="inspector-danger-actions">
                <button className="button button--secondary" onClick={duplicateSelected}><Copy size={15} /> Nhân bản trang</button>
                <button className="button button--danger" onClick={deleteSelected}><Trash2 size={15} /> Xóa trang</button>
              </section>
            </>
          )}
        </aside>
      </div>

      <section className="panel global-schedule-editor">
        <div className="global-schedule-editor__head">
          <div><span>LỊCH PHÁT TOÀN PLAYLIST</span><h3>Khung thời gian áp dụng mặc định</h3><p>Trang có lịch riêng sẽ dùng lịch riêng; các trang còn lại theo lịch này.</p></div>
          <label className="schedule-master-switch"><input type="checkbox" checked={config.schedule.enabled} onChange={(event) => updateConfig((current) => ({ ...current, schedule: { ...current.schedule, enabled: event.target.checked } }))} /><i /><span>{config.schedule.enabled ? 'Đang áp dụng lịch' : 'Phát liên tục'}</span></label>
        </div>
        <div className="global-schedule-editor__body">
          <Field label="Từ ngày"><input type="date" value={config.schedule.startDate} onChange={(event) => updateConfig((current) => ({ ...current, schedule: { ...current.schedule, startDate: event.target.value } }))} /></Field>
          <Field label="Đến ngày"><input type="date" value={config.schedule.endDate} onChange={(event) => updateConfig((current) => ({ ...current, schedule: { ...current.schedule, endDate: event.target.value } }))} /></Field>
          <Field label="Bắt đầu mỗi ngày"><input type="time" value={config.schedule.dailyStart} onChange={(event) => updateConfig((current) => ({ ...current, schedule: { ...current.schedule, dailyStart: event.target.value } }))} /></Field>
          <Field label="Kết thúc mỗi ngày"><input type="time" value={config.schedule.dailyEnd} onChange={(event) => updateConfig((current) => ({ ...current, schedule: { ...current.schedule, dailyEnd: event.target.value } }))} /></Field>
          <div className="editor-field global-schedule-editor__weekdays"><span>Ngày trong tuần · Asia/Ho_Chi_Minh</span><WeekdayPicker schedule={config.schedule} onChange={(schedule) => updateConfig((current) => ({ ...current, schedule }))} /></div>
          <label className="editor-check"><input type="checkbox" checked={config.repeat} onChange={(event) => updateConfig((current) => ({ ...current, repeat: event.target.checked }))} /><Check size={15} /><span>Lặp lại playlist liên tục</span></label>
        </div>
        <div className="local-demo-note"><Save size={16} /><div><strong>Tự lưu trên máy · Có nút đồng bộ Cloud</strong><span>Hai tab cùng trình duyệt cập nhật ngay. Khi đã đăng nhập Supabase, dùng “Lưu bản nháp” để lưu cấu hình và media cho 9 TV.</span></div></div>
      </section>
    </>
  )
}
