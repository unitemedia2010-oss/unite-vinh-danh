import { boards, demoMeta } from '../data/mock'
import type {
  Board,
  Honoree,
  PlaylistConfig,
  PlaylistDraftItem,
  PlaylistItem,
  PlaylistKind,
} from '../types'
import { normalizePlaylistItem } from './playlistConfig'
import type {
  JsonObject,
  JsonValue,
  SupabasePlaylistSnapshot,
} from './supabasePlaylistRepository'
import { SUPABASE_BOARD_CODE_BY_LOCAL_ID } from './supabasePlaylistRepository'

const MANIFEST_SCHEMA = 'unite-vinhdanh-release'
const MANIFEST_VERSION = 1
const LEGACY_SAMPLE_VIDEO_URL = 'https://media.w3.org/2010/05/video/movie_300.mp4'

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textValue = (value: unknown) =>
  typeof value === 'string' ? value : ''

const numberValue = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const firstText = (record: UnknownRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = textValue(record[key]).trim()
    if (value) return value
  }
  return ''
}

const firstNumber = (record: UnknownRecord, fallback: number, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/[^\d.-]/g, ''))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

const shortNameFromFullName = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words.slice(-2).join(' ') || name
}

const initialsFromName = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

const recognitionAccents = [
  '#f2c75c',
  '#b8c7dc',
  '#d59a68',
  '#9fd8c8',
  '#8db5df',
  '#d0a8dc',
  '#ef9d91',
  '#c1d986',
  '#f0b78b',
  '#99cde1',
] as const

const fallbackBoardGroup = (boardId: string): Board['group'] => {
  if (boardId.startsWith('manager-')) return 'manager'
  if (boardId.startsWith('leader-')) return 'leader'
  if (boardId.includes('parttime')) return 'parttime'
  if (boardId.includes('fulltime')) return 'fulltime'
  return 'team'
}

const recognitionBoardFromItem = (
  value: UnknownRecord,
  item: PlaylistDraftItem,
): Board | undefined => {
  const rawBoard = isRecord(value.recognition_board)
    ? value.recognition_board
    : isRecord(value.recognitionBoard)
      ? value.recognitionBoard
      : null
  if (!rawBoard) return undefined

  const rawEntries = Array.isArray(rawBoard.entries)
    ? rawBoard.entries
    : Array.isArray(rawBoard.rankings)
      ? rawBoard.rankings
      : []
  const honorees = rawEntries
    .map((entry, index): Honoree | null => {
      if (!isRecord(entry)) return null
      const name = firstText(entry, 'name', 'employeeName')
      if (!name) return null
      const rank = Math.max(1, Math.round(firstNumber(entry, index + 1, 'rank', 'position')))
      const role = firstText(entry, 'role', 'positionName')
      const team = firstText(entry, 'team', 'teamName') || role
      const branch = firstText(entry, 'branch', 'branchName', 'branch_code', 'branchCode')
      const shortName = firstText(entry, 'short_name', 'shortName') || shortNameFromFullName(name)
      const photoUrl = firstText(entry, 'avatar_url', 'avatarUrl', 'photo_url', 'photoUrl')
      const entityCode = firstText(entry, 'entity_code', 'employee_code', 'employeeCode')
        || firstText(entry, 'employee_id', 'employeeId').split(':')[0]
      return {
        rank,
        entityCode: entityCode || undefined,
        name,
        shortName,
        role,
        team,
        branch,
        revenue: Math.max(0, firstNumber(entry, 0, 'revenue', 'amount', 'sales')),
        accent: firstText(entry, 'accent') || recognitionAccents[index % recognitionAccents.length],
        initials: firstText(entry, 'initials') || initialsFromName(name),
        photoUrl: photoUrl || undefined,
      }
    })
    .filter((entry): entry is Honoree => Boolean(entry))
    .sort((left, right) => left.rank - right.rank)

  const fallback = boards.find((candidate) => candidate.id === item.boardId)
  const periodLabel = firstText(rawBoard, 'period_label', 'periodLabel')
  const boardId = item.boardId || `release-board-${item.id}`
  return {
    id: boardId,
    group: fallback?.group ?? fallbackBoardGroup(boardId),
    title: firstText(rawBoard, 'category_label', 'categoryLabel') || item.headline || fallback?.title || item.title,
    subtitle: item.subtitle || fallback?.subtitle || periodLabel,
    threshold: fallback?.threshold || periodLabel,
    sourceRange: periodLabel || 'Published release manifest',
    honorees,
  }
}

const jsonValue = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue

const androidType = (kind: PlaylistKind) =>
  kind === 'event' ? 'announcement' : kind

export interface ReleaseRecognitionDataset {
  boards: readonly Board[]
  periodLabel: string
  periodId: string
  importBatchId?: string | null
}

const recognitionPayload = (
  slide: PlaylistDraftItem,
  dataset: ReleaseRecognitionDataset,
): JsonObject | undefined => {
  if (slide.kind !== 'recognition') return undefined
  const board = dataset.boards.find((candidate) => candidate.id === slide.boardId)
  if (!board) return undefined
  return {
    boardCode: SUPABASE_BOARD_CODE_BY_LOCAL_ID[board.id] ?? board.id,
    period_label: dataset.periodLabel,
    period_id: dataset.periodId,
    import_batch_id: dataset.importBatchId ?? null,
    category_label: board.title,
    entries: board.honorees.map((person) => ({
      rank: person.rank,
      entity_code: person.entityCode ?? '',
      employee_id: person.entityCode
        ? `${person.entityCode}:${person.branch || person.team || person.rank}`
        : `${board.id}:${person.rank}`,
      name: person.name,
      short_name: person.shortName,
      role: person.role,
      team: person.team,
      branch: person.branch,
      revenue: person.revenue,
      photo_path: person.photoPath ?? '',
    })),
  }
}

/**
 * Produces one manifest that Android TV can decode while retaining the complete
 * per-slide Web Player configuration in `web_config`.
 */
export const buildReleaseManifest = (
  snapshot: SupabasePlaylistSnapshot,
  releaseVersion: string,
  dataset: ReleaseRecognitionDataset,
): JsonObject => {
  const slideRecord = new Map(snapshot.slides.map((entry) => [entry.slide.id, entry]))
  const playlist = snapshot.config.items
    .filter((slide) => slide.enabled)
    .filter((slide) => slide.kind !== 'recognition' || dataset.boards.some((board) => board.id === slide.boardId))
    .map((slide) => {
      const record = slideRecord.get(slide.id)
      const recognitionBoard = recognitionPayload(slide, dataset)
      const requestedMediaUrl = slide.mediaUrl.trim()
      const publicMediaUrl = requestedMediaUrl === LEGACY_SAMPLE_VIDEO_URL ? '' : requestedMediaUrl
      const announcementBody = slide.kind === 'event'
        ? [slide.body, slide.eventDate, slide.eventTime, slide.location].filter(Boolean).join('\n')
        : slide.body
      const item: JsonObject = {
        id: slide.id,
        type: androidType(slide.kind),
        kind: slide.kind,
        title: slide.headline || slide.title,
        duration_seconds: Math.max(3, Math.round(slide.duration)),
        announcement_body: announcementBody,
        web_config: jsonValue({
          ...slide,
          backgroundAssetId: undefined,
          logoAssetId: undefined,
          mediaAssetId: undefined,
          backgroundUrl: undefined,
          logoUrl: undefined,
          mediaUrl: '',
        }),
      }
      if (record?.media.backgroundPath) item.backgroundPath = record.media.backgroundPath
      if (record?.media.logoPath) item.logoPath = record.media.logoPath
      if (record?.media.mediaPath) {
        item.mediaPath = record.media.mediaPath
      } else if (slide.kind === 'video' && publicMediaUrl) {
        // Android consumes snake_case while the Web player accepts camelCase.
        // Only public URLs are embedded; a private Storage path always wins and
        // is converted to fresh signed URLs by screen-api at delivery time.
        item.mediaUrl = publicMediaUrl
        item.media_url = publicMediaUrl
      }
      if (record?.media.thumbnailPath) item.thumbnailPath = record.media.thumbnailPath
      if (recognitionBoard) item.recognition_board = recognitionBoard
      return item
    })

  return {
    schema: MANIFEST_SCHEMA,
    schema_version: MANIFEST_VERSION,
    version: releaseVersion,
    period_label: dataset.periodLabel,
    period_id: dataset.periodId,
    import_batch_id: dataset.importBatchId ?? null,
    web_playlist: jsonValue({
      version: 1,
      name: snapshot.config.name,
      schedule: snapshot.config.schedule,
      repeat: snapshot.config.repeat,
      updatedAt: snapshot.config.updatedAt,
    }),
    playlist,
  }
}

/** Keeps existing demo callers stable while production release creation uses
 * buildReleaseManifest with the selected validated import batch. */
export const buildDemoReleaseManifest = (
  snapshot: SupabasePlaylistSnapshot,
  releaseVersion: string,
): JsonObject => buildReleaseManifest(snapshot, releaseVersion, {
  boards,
  periodLabel: `Tháng ${demoMeta.month}/${demoMeta.year}`,
  periodId: `${demoMeta.year}-${String(demoMeta.month).padStart(2, '0')}`,
})

const isPlaylistKind = (value: unknown): value is PlaylistKind =>
  value === 'recognition'
  || value === 'video'
  || value === 'event'
  || value === 'announcement'

const webSlideFromItem = (value: unknown, index: number): PlaylistDraftItem | null => {
  if (!isRecord(value)) return null
  const webConfig = isRecord(value.web_config) ? value.web_config : {}
  const kindValue = webConfig.kind ?? value.kind ?? value.type
  const kind: PlaylistKind = isPlaylistKind(kindValue)
    ? kindValue
    : 'announcement'
  const id = textValue(webConfig.id) || textValue(value.id) || `release-item-${index + 1}`
  const title = textValue(webConfig.title) || textValue(value.title) || `Nội dung ${index + 1}`
  const duration = Math.max(
    3,
    numberValue(webConfig.duration, numberValue(value.duration_seconds, 15)),
  )
  const item: PlaylistItem = {
    id,
    boardId: textValue(webConfig.boardId) || undefined,
    title,
    kind,
    meta: textValue(webConfig.meta),
    duration,
    enabled: webConfig.enabled !== false,
    audience: textValue(webConfig.audience) || 'Toàn hệ thống',
  }
  const base = normalizePlaylistItem(item)
  const parsed: PlaylistDraftItem = {
    ...base,
    ...(webConfig as Partial<PlaylistDraftItem>),
    ...item,
    backgroundAssetId: undefined,
    logoAssetId: undefined,
    mediaAssetId: undefined,
    backgroundUrl: textValue(value.backgroundUrl) || textValue(webConfig.backgroundUrl) || undefined,
    logoUrl: textValue(value.logoUrl) || textValue(webConfig.logoUrl) || undefined,
    mediaUrl: textValue(value.mediaUrl) || textValue(value.media_url) || textValue(webConfig.mediaUrl),
    branchIds: (
      Array.isArray(webConfig.branchIds)
        ? webConfig.branchIds
        : Array.isArray(value.branchIds)
          ? value.branchIds
          : Array.isArray(value.branch_ids)
            ? value.branch_ids
            : []
    ).filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())),
  }
  parsed.recognitionBoard = recognitionBoardFromItem(value, parsed)
  return parsed
}

/**
 * Strictly accepts manifests produced by buildReleaseManifest (including the
 * explicitly labeled demo helper). Returning null leaves the last playable
 * local release untouched.
 */
export const playlistConfigFromReleaseManifest = (
  manifest: UnknownRecord,
): PlaylistConfig | null => {
  if (manifest.schema !== MANIFEST_SCHEMA || manifest.schema_version !== MANIFEST_VERSION) return null
  if (!isRecord(manifest.web_playlist) || !Array.isArray(manifest.playlist)) return null
  const items = manifest.playlist
    .map(webSlideFromItem)
    .filter((item): item is PlaylistDraftItem => Boolean(item))
  if (!items.length) return null
  const webPlaylist = manifest.web_playlist
  const schedule = isRecord(webPlaylist.schedule)
    ? webPlaylist.schedule as unknown as PlaylistConfig['schedule']
    : undefined
  const fallback = snapshotSafeDefaults(items)
  return {
    ...fallback,
    name: textValue(webPlaylist.name) || fallback.name,
    schedule: schedule
      ? {
          ...fallback.schedule,
          ...schedule,
          weekdays: Array.isArray(schedule.weekdays)
            ? schedule.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
            : fallback.schedule.weekdays,
        }
      : fallback.schedule,
    repeat: webPlaylist.repeat !== false,
    updatedAt: textValue(webPlaylist.updatedAt) || new Date().toISOString(),
  }
}

const snapshotSafeDefaults = (items: PlaylistDraftItem[]): PlaylistConfig => ({
  version: 1,
  name: 'Chu kỳ vinh danh toàn hệ thống',
  items,
  schedule: {
    enabled: false,
    startDate: '',
    endDate: '',
    dailyStart: '00:00',
    dailyEnd: '23:59',
    weekdays: [1, 2, 3, 4, 5, 6, 0],
  },
  repeat: true,
  updatedAt: new Date().toISOString(),
})
