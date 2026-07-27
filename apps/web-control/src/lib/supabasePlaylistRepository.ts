import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type {
  PlaylistConfig,
  PlaylistDraftItem,
  PlaylistItem,
  PlaylistKind,
  ScheduleWindow,
} from '../types'
import { defaultSchedule, normalizePlaylistItem } from './playlistConfig'
import {
  getSupabase,
  publishReleaseFunction,
} from './supabase'

const PLAYLIST_ENVELOPE_SCHEMA = 'unite-vinhdanh-playlist-slide'
const PLAYLIST_ENVELOPE_VERSION = 1
const MEDIA_BUCKET = 'vinhdanh-media'
const MAX_MEDIA_BYTES = 524_288_000

const ALLOWED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
])

const EXTENSION_BY_MEDIA_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
}

export const SUPABASE_BOARD_CODE_BY_LOCAL_ID: Readonly<Record<string, string>> = {
  'manager-thong-soai': 'QLCN_THONG_SOAI',
  'manager-dai-tuong': 'QLCN_DAI_TUONG',
  'manager-thu-linh': 'QLCN_THU_LINH',
  'leader-ky-lan': 'LEADER_KY_LAN',
  'leader-phuong-hoang': 'LEADER_PHUONG_HOANG',
  'leader-su-tu': 'LEADER_SU_TU',
  'sale-fulltime': 'SALE_FULL_TIME',
  'sale-parttime': 'SALE_PART_TIME',
  'team-ranking': 'TEAM_RANKING',
}

const LOCAL_BOARD_ID_BY_SUPABASE_CODE = Object.fromEntries(
  Object.entries(SUPABASE_BOARD_CODE_BY_LOCAL_ID).map(([localId, code]) => [code, localId]),
) as Readonly<Record<string, string>>

export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export type SupabasePlaylistScope = 'all' | 'branch' | 'screen'
export type SupabasePlaylistStatus = 'draft' | 'active' | 'archived'

export type SupabasePlaylistErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_AUTHENTICATED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR'
  | 'STORAGE_ERROR'
  | 'FUNCTION_ERROR'

export class SupabasePlaylistError extends Error {
  readonly code: SupabasePlaylistErrorCode

  constructor(
    code: SupabasePlaylistErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SupabasePlaylistError'
    this.code = code
  }
}

export interface SupabaseSlideMediaBindings {
  backgroundPath?: string
  logoPath?: string
  mediaPath?: string
  thumbnailPath?: string
}

export interface SupabaseSlideRecord {
  playlistItemId: string
  contentItemId: string | null
  boardRowId: string | null
  position: number
  slide: PlaylistDraftItem
  media: SupabaseSlideMediaBindings
}

export interface SupabasePlaylistSummary {
  id: string
  name: string
  scope: SupabasePlaylistScope
  branchId: string | null
  status: SupabasePlaylistStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SupabasePlaylistSnapshot extends SupabasePlaylistSummary {
  config: PlaylistConfig
  slides: SupabaseSlideRecord[]
}

export interface SavePlaylistOptions {
  playlistId?: string
  /**
   * When playlistId is absent, reuse the single draft with the same canonical
   * name. Defaults to true. More than one match is treated as ambiguous.
   */
  matchDraftByName?: boolean
  scope?: SupabasePlaylistScope
  branchId?: string | null
  status?: SupabasePlaylistStatus
  mediaBySlideId?: Readonly<Record<string, SupabaseSlideMediaBindings>>
}

export interface SaveSlideOptions {
  playlistId: string
  slide: PlaylistDraftItem
  position?: number
  media?: SupabaseSlideMediaBindings
}

export interface UploadPlaylistMediaInput {
  playlistId: string
  slideId: string
  purpose: 'background' | 'logo' | 'media' | 'thumbnail'
  data: Blob
  fileName: string
  contentType?: string
  upsert?: boolean
}

export interface UploadedPlaylistMedia {
  bucket: typeof MEDIA_BUCKET
  path: string
  contentType: string
  size: number
  originalName: string
}

export interface CreateReadyReleaseInput {
  releaseVersion: string
  playlistId: string
  manifest: JsonObject
  periodId?: string | null
  importBatchId?: string | null
  parentReleaseId?: string | null
  activateAt?: string | null
  targetConfig?: JsonObject
}

export interface ReadyReleaseRecord {
  id: string
  releaseVersion: string
  playlistId: string
  status: 'ready'
  activateAt: string | null
  createdAt: string
}

export interface PublishReleaseInput {
  releaseId: string
  activateAt?: string | null
  screenIds?: string[]
  branchIds?: string[]
}

export interface PublishReleaseResult {
  ok: boolean
  releaseId: string
  releaseVersion?: string
  activateAt?: string
  targets?: number
  broadcastAccepted?: boolean
}

interface PlaylistGlobalEnvelope {
  version: 1
  schedule: ScheduleWindow
  repeat: boolean
  updatedAt: string
}

interface PlaylistSlideEnvelope {
  schema: typeof PLAYLIST_ENVELOPE_SCHEMA
  schemaVersion: typeof PLAYLIST_ENVELOPE_VERSION
  playlist: PlaylistGlobalEnvelope
  slide: PlaylistDraftItem
  media: SupabaseSlideMediaBindings
}

interface DbPlaylistRow {
  id: string
  name: string
  scope: SupabasePlaylistScope
  branch_id: string | null
  status: SupabasePlaylistStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

interface DbContentItemRow {
  id: string
  content_type: string
  title: string
  body: string | null
  media_path: string | null
  thumbnail_path: string | null
  duration_seconds: number
  audio_enabled: boolean
  metadata: unknown
}

interface DbBoardRow {
  id: string
  code: string
}

interface DbPlaylistItemRow {
  id: string
  position: number
  duration_seconds: number | null
  board_id: string | null
  content_item_id: string | null
  config: unknown
  content_item: DbContentItemRow | DbContentItemRow[] | null
  board: DbBoardRow | DbBoardRow[] | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const detailsOf = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message
  if (isRecord(error) && typeof error.message === 'string') return error.message
  return ''
}

const repositoryError = (
  code: SupabasePlaylistErrorCode,
  message: string,
  cause?: unknown,
) => {
  const detail = detailsOf(cause)
  return new SupabasePlaylistError(
    code,
    detail ? `${message} Chi tiết: ${detail}` : message,
    cause === undefined ? undefined : { cause },
  )
}

const requireAdminSession = async (): Promise<{
  supabase: SupabaseClient
  session: Session
}> => {
  const supabase = getSupabase()
  if (!supabase) {
    throw repositoryError(
      'NOT_CONFIGURED',
      'Supabase chưa được cấu hình. Hãy kiểm tra VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.',
    )
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw repositoryError(
      'NOT_AUTHENTICATED',
      'Không đọc được phiên đăng nhập Admin.',
      error,
    )
  }
  if (!data.session?.access_token) {
    throw repositoryError(
      'NOT_AUTHENTICATED',
      'Admin cần đăng nhập trước khi thao tác với playlist trên Supabase.',
    )
  }
  return { supabase, session: data.session }
}

const toJson = (value: unknown): JsonValue => {
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue
  } catch (error) {
    throw repositoryError(
      'INVALID_INPUT',
      'Cấu hình playlist chứa dữ liệu không thể chuyển thành JSON.',
      error,
    )
  }
}

const firstRelation = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] ?? null : value

const isPlaylistKind = (value: unknown): value is PlaylistKind =>
  value === 'recognition'
  || value === 'video'
  || value === 'announcement'
  || value === 'event'

const kindFromContentType = (value: string): PlaylistKind => {
  if (value === 'recognition' || value === 'video' || value === 'event') return value
  return 'announcement'
}

const contentTypeFromKind = (kind: PlaylistKind) => kind

const isScheduleWindow = (value: unknown): value is ScheduleWindow => {
  if (!isRecord(value)) return false
  return typeof value.enabled === 'boolean'
    && typeof value.startDate === 'string'
    && typeof value.endDate === 'string'
    && typeof value.dailyStart === 'string'
    && typeof value.dailyEnd === 'string'
    && Array.isArray(value.weekdays)
    && value.weekdays.every((weekday) => typeof weekday === 'number')
}

const readEnvelope = (value: unknown): PlaylistSlideEnvelope | null => {
  if (!isRecord(value)) return null
  if (
    value.schema !== PLAYLIST_ENVELOPE_SCHEMA
    || value.schemaVersion !== PLAYLIST_ENVELOPE_VERSION
    || !isRecord(value.playlist)
    || !isRecord(value.slide)
  ) return null

  const playlist = value.playlist
  const slide = value.slide
  if (
    playlist.version !== 1
    || !isScheduleWindow(playlist.schedule)
    || typeof playlist.repeat !== 'boolean'
    || typeof playlist.updatedAt !== 'string'
    || typeof slide.id !== 'string'
    || typeof slide.title !== 'string'
    || !isPlaylistKind(slide.kind)
    || typeof slide.duration !== 'number'
  ) return null

  return value as unknown as PlaylistSlideEnvelope
}

const makeEnvelope = (
  config: PlaylistConfig,
  slide: PlaylistDraftItem,
  media: SupabaseSlideMediaBindings,
): JsonValue => toJson({
  schema: PLAYLIST_ENVELOPE_SCHEMA,
  schemaVersion: PLAYLIST_ENVELOPE_VERSION,
  playlist: {
    version: 1,
    schedule: config.schedule,
    repeat: config.repeat,
    updatedAt: config.updatedAt,
  },
  slide,
  media,
} satisfies PlaylistSlideEnvelope)

const fallbackSlideFromRow = (
  row: DbPlaylistItemRow,
  content: DbContentItemRow | null,
  board: DbBoardRow | null,
): PlaylistDraftItem => {
  const kind = kindFromContentType(content?.content_type ?? (board ? 'recognition' : 'announcement'))
  const boardId = board ? LOCAL_BOARD_ID_BY_SUPABASE_CODE[board.code] : undefined
  const baseItem: PlaylistItem = {
    id: `supabase-${row.id}`,
    boardId,
    title: content?.title ?? board?.code ?? 'Trang Supabase',
    kind,
    meta: '',
    duration: Math.max(1, row.duration_seconds ?? content?.duration_seconds ?? 15),
    enabled: true,
    audience: 'Toàn hệ thống',
  }
  const normalized = normalizePlaylistItem(baseItem)
  return {
    ...normalized,
    headline: content?.title ?? normalized.headline,
    body: content?.body ?? '',
    mediaUrl: '',
    audioEnabled: content?.audio_enabled ?? normalized.audioEnabled,
  }
}

const summaryFromRow = (row: DbPlaylistRow): SupabasePlaylistSummary => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  branchId: row.branch_id,
  status: row.status,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const validatePlaylist = (config: PlaylistConfig) => {
  if (!config.name.trim()) {
    throw repositoryError('INVALID_INPUT', 'Tên playlist không được để trống.')
  }
  if (!config.items.length) {
    throw repositoryError(
      'INVALID_INPUT',
      'Playlist cần ít nhất một slide để lưu đầy đủ lịch phát.',
    )
  }
  const ids = new Set<string>()
  for (const slide of config.items) {
    if (!slide.id || ids.has(slide.id)) {
      throw repositoryError(
        'INVALID_INPUT',
        `Mã slide bị trống hoặc trùng lặp: ${slide.id || '(trống)'}.`,
      )
    }
    ids.add(slide.id)
    if (!Number.isFinite(slide.duration) || slide.duration <= 0) {
      throw repositoryError(
        'INVALID_INPUT',
        `Thời lượng của slide “${slide.title}” phải lớn hơn 0.`,
      )
    }
    if (
      slide.kind === 'recognition'
      && (!slide.boardId || !SUPABASE_BOARD_CODE_BY_LOCAL_ID[slide.boardId])
    ) {
      throw repositoryError(
        'INVALID_INPUT',
        `Slide “${slide.title}” chưa liên kết đúng bảng vinh danh trên Supabase.`,
      )
    }
  }
}

const canonicalPlaylistName = (name: string) =>
  name.trim().replace(/\s+/g, ' ')

const loadBoardIds = async (
  supabase: SupabaseClient,
  slides: readonly PlaylistDraftItem[],
) => {
  const requiredCodes = Array.from(new Set(
    slides
      .filter((slide) => slide.kind === 'recognition' && slide.boardId)
      .map((slide) => SUPABASE_BOARD_CODE_BY_LOCAL_ID[slide.boardId!])
      .filter((code): code is string => Boolean(code)),
  ))
  if (!requiredCodes.length) return new Map<string, string>()

  const { data, error } = await supabase
    .from('award_boards')
    .select('id,code')
    .in('code', requiredCodes)
  if (error) {
    throw repositoryError(
      'DATABASE_ERROR',
      'Không đọc được danh sách bảng vinh danh trên Supabase.',
      error,
    )
  }

  const rows = (data ?? []) as unknown as DbBoardRow[]
  const byCode = new Map(rows.map((row) => [row.code, row.id]))
  const missing = requiredCodes.filter((code) => !byCode.has(code))
  if (missing.length) {
    throw repositoryError(
      'NOT_FOUND',
      `Supabase chưa có bảng vinh danh: ${missing.join(', ')}.`,
    )
  }
  return byCode
}

const deleteContentItemsIfUnreferenced = async (
  supabase: SupabaseClient,
  contentItemIds: readonly string[],
) => {
  const uniqueIds = Array.from(new Set(contentItemIds.filter(Boolean)))
  if (!uniqueIds.length) return

  const { data: references, error: referenceError } = await supabase
    .from('playlist_items')
    .select('content_item_id')
    .in('content_item_id', uniqueIds)
  if (referenceError) return

  const referenced = new Set(
    ((references ?? []) as Array<{ content_item_id: string | null }>)
      .map((row) => row.content_item_id)
      .filter((id): id is string => Boolean(id)),
  )
  const orphanIds = uniqueIds.filter((id) => !referenced.has(id))
  if (orphanIds.length) {
    await supabase.from('content_items').delete().in('id', orphanIds)
  }
}

/**
 * Lists playlist headers only. Use loadPlaylistFromSupabase for slide data.
 */
export const listSupabasePlaylists = async (): Promise<SupabasePlaylistSummary[]> => {
  const { supabase } = await requireAdminSession()
  const { data, error } = await supabase
    .from('playlists')
    .select('id,name,scope,branch_id,status,created_by,created_at,updated_at')
    .order('updated_at', { ascending: false })
  if (error) {
    throw repositoryError(
      'DATABASE_ERROR',
      'Không tải được danh sách playlist từ Supabase.',
      error,
    )
  }
  return ((data ?? []) as unknown as DbPlaylistRow[]).map(summaryFromRow)
}

/**
 * Loads the exact PlaylistConfig envelope plus database IDs and private media paths.
 */
export const loadPlaylistFromSupabase = async (
  playlistId: string,
): Promise<SupabasePlaylistSnapshot> => {
  if (!playlistId) {
    throw repositoryError('INVALID_INPUT', 'Thiếu mã playlist cần tải.')
  }
  const { supabase } = await requireAdminSession()
  const [playlistResult, itemsResult] = await Promise.all([
    supabase
      .from('playlists')
      .select('id,name,scope,branch_id,status,created_by,created_at,updated_at')
      .eq('id', playlistId)
      .single(),
    supabase
      .from('playlist_items')
      .select(`
        id,
        position,
        duration_seconds,
        board_id,
        content_item_id,
        config,
        content_item:content_items(
          id,content_type,title,body,media_path,thumbnail_path,
          duration_seconds,audio_enabled,metadata
        ),
        board:award_boards(id,code)
      `)
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true }),
  ])

  if (playlistResult.error) {
    const code = playlistResult.error.code === 'PGRST116' ? 'NOT_FOUND' : 'DATABASE_ERROR'
    throw repositoryError(
      code,
      code === 'NOT_FOUND'
        ? 'Không tìm thấy playlist trên Supabase.'
        : 'Không tải được thông tin playlist từ Supabase.',
      playlistResult.error,
    )
  }
  if (itemsResult.error) {
    throw repositoryError(
      'DATABASE_ERROR',
      'Không tải được các slide của playlist từ Supabase.',
      itemsResult.error,
    )
  }

  const playlistRow = playlistResult.data as unknown as DbPlaylistRow
  const itemRows = (itemsResult.data ?? []) as unknown as DbPlaylistItemRow[]
  const globalEnvelope = itemRows
    .map((row) => readEnvelope(row.config)?.playlist)
    .find((value): value is PlaylistGlobalEnvelope => Boolean(value)) ?? null

  const slides = itemRows.map((row): SupabaseSlideRecord => {
    const content = firstRelation(row.content_item)
    const board = firstRelation(row.board)
    const envelope = readEnvelope(row.config)
    const slide = envelope?.slide ?? fallbackSlideFromRow(row, content, board)
    const media = envelope?.media ?? {
      mediaPath: content?.media_path ?? undefined,
      thumbnailPath: content?.thumbnail_path ?? undefined,
    }
    return {
      playlistItemId: row.id,
      contentItemId: row.content_item_id,
      boardRowId: row.board_id,
      position: row.position,
      slide,
      media,
    }
  })

  const config: PlaylistConfig = {
    version: 1,
    name: playlistRow.name,
    items: slides.map((entry) => entry.slide),
    schedule: globalEnvelope?.schedule ?? defaultSchedule(),
    repeat: globalEnvelope?.repeat ?? true,
    updatedAt: playlistRow.updated_at,
  }

  return {
    ...summaryFromRow(playlistRow),
    config,
    slides,
  }
}

/**
 * Saves a complete playlist snapshot using the existing playlists,
 * content_items and playlist_items tables. Custom media paths remain in
 * playlist_items.config while the primary video/audio path is mirrored to
 * content_items.media_path.
 */
export const savePlaylistToSupabase = async (
  config: PlaylistConfig,
  options: SavePlaylistOptions = {},
): Promise<SupabasePlaylistSnapshot> => {
  validatePlaylist(config)
  const { supabase, session } = await requireAdminSession()
  let scope = options.scope ?? 'all'
  let branchId = options.branchId ?? null
  let status = options.status ?? 'draft'
  const playlistName = canonicalPlaylistName(config.name)

  const boardIds = await loadBoardIds(supabase, config.items)
  let playlistRow: DbPlaylistRow
  let createdPlaylist = false
  let matchedDraft: DbPlaylistRow | null = null

  if (
    !options.playlistId
    && options.matchDraftByName !== false
    && status === 'draft'
  ) {
    const { data, error } = await supabase
      .from('playlists')
      .select('id,name,scope,branch_id,status,created_by,created_at,updated_at')
      .eq('name', playlistName)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(2)
    if (error) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Không kiểm tra được bản nháp playlist cùng tên.',
        error,
      )
    }
    const matches = (data ?? []) as unknown as DbPlaylistRow[]
    if (matches.length > 1) {
      throw repositoryError(
        'INVALID_INPUT',
        `Có nhiều bản nháp cùng tên “${playlistName}”. Hãy chọn playlistId cụ thể để tránh ghi nhầm.`,
      )
    }
    matchedDraft = matches[0] ?? null
  }

  if (options.playlistId || matchedDraft) {
    if (matchedDraft) {
      playlistRow = matchedDraft
    } else {
      const { data, error } = await supabase
        .from('playlists')
        .select('id,name,scope,branch_id,status,created_by,created_at,updated_at')
        .eq('id', options.playlistId!)
        .single()
      if (error) {
        throw repositoryError(
          error.code === 'PGRST116' ? 'NOT_FOUND' : 'DATABASE_ERROR',
          'Không tìm thấy playlist cần cập nhật trên Supabase.',
          error,
        )
      }
      playlistRow = data as unknown as DbPlaylistRow
    }
    scope = options.scope ?? playlistRow.scope
    branchId = options.branchId === undefined ? playlistRow.branch_id : options.branchId
    status = options.status ?? playlistRow.status
  } else {
    if (scope === 'branch' && !branchId) {
      throw repositoryError(
        'INVALID_INPUT',
        'Playlist phạm vi chi nhánh cần một branchId của Supabase.',
      )
    }
    const { data, error } = await supabase
      .from('playlists')
      .insert({
        name: playlistName,
        scope,
        branch_id: scope === 'branch' ? branchId : null,
        status,
        created_by: session.user.id,
      })
      .select('id,name,scope,branch_id,status,created_by,created_at,updated_at')
      .single()
    if (error) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Không tạo được playlist trên Supabase.',
        error,
      )
    }
    playlistRow = data as unknown as DbPlaylistRow
    createdPlaylist = true
  }

  if (scope === 'branch' && !branchId) {
    throw repositoryError(
      'INVALID_INPUT',
      'Playlist phạm vi chi nhánh cần một branchId của Supabase.',
    )
  }

  const { data: previousItems, error: previousError } = await supabase
    .from('playlist_items')
    .select('content_item_id')
    .eq('playlist_id', playlistRow.id)
  if (previousError) {
    if (createdPlaylist) {
      await supabase.from('playlists').delete().eq('id', playlistRow.id)
    }
    throw repositoryError(
      'DATABASE_ERROR',
      'Không kiểm tra được dữ liệu playlist hiện tại.',
      previousError,
    )
  }
  const previousContentIds = ((previousItems ?? []) as Array<{ content_item_id: string | null }>)
    .map((row) => row.content_item_id)
    .filter((id): id is string => Boolean(id))

  const contentPayloads = config.items.map((slide, position) => {
    const media = options.mediaBySlideId?.[slide.id] ?? {}
    return {
      content_type: contentTypeFromKind(slide.kind),
      title: slide.headline.trim() || slide.title,
      body: slide.body || null,
      media_path: media.mediaPath ?? null,
      thumbnail_path: media.thumbnailPath ?? null,
      duration_seconds: Math.max(1, Math.round(slide.duration)),
      audio_enabled: slide.audioEnabled,
      starts_at: null,
      ends_at: null,
      priority: position,
      metadata: toJson({
        repositorySchema: PLAYLIST_ENVELOPE_SCHEMA,
        localItemId: slide.id,
        subtitle: slide.subtitle,
      }),
      created_by: session.user.id,
    }
  })

  let newContentIds: string[] = []
  let playlistItemsCommitted = false
  try {
    const { data: contentRows, error: contentError } = await supabase
      .from('content_items')
      .insert(contentPayloads)
      .select('id,metadata')
    if (contentError) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Không lưu được nội dung các slide lên Supabase.',
        contentError,
      )
    }

    const contentIdByLocalItem = new Map<string, string>()
    for (const row of (contentRows ?? []) as Array<{ id: string; metadata: unknown }>) {
      const localItemId = isRecord(row.metadata) && typeof row.metadata.localItemId === 'string'
        ? row.metadata.localItemId
        : null
      if (localItemId) contentIdByLocalItem.set(localItemId, row.id)
    }
    newContentIds = Array.from(contentIdByLocalItem.values())
    if (newContentIds.length !== config.items.length) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Supabase không trả về đầy đủ mã nội dung cho các slide vừa lưu.',
      )
    }

    const playlistItemPayloads = config.items.map((slide, position) => {
      const boardCode = slide.boardId
        ? SUPABASE_BOARD_CODE_BY_LOCAL_ID[slide.boardId]
        : undefined
      return {
        playlist_id: playlistRow.id,
        content_item_id: contentIdByLocalItem.get(slide.id)!,
        board_id: boardCode ? boardIds.get(boardCode) ?? null : null,
        position,
        duration_seconds: Math.max(1, Math.round(slide.duration)),
        config: makeEnvelope(
          config,
          slide,
          options.mediaBySlideId?.[slide.id] ?? {},
        ),
      }
    })

    const { error: itemError } = await supabase
      .from('playlist_items')
      .upsert(playlistItemPayloads, { onConflict: 'playlist_id,position' })
    if (itemError) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Không lưu được thứ tự slide của playlist.',
        itemError,
      )
    }
    playlistItemsCommitted = true

    const { error: extraItemError } = await supabase
      .from('playlist_items')
      .delete()
      .eq('playlist_id', playlistRow.id)
      .gte('position', config.items.length)
    if (extraItemError) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Đã lưu slide mới nhưng chưa gỡ được các slide thừa.',
        extraItemError,
      )
    }

    const { data: updatedPlaylist, error: playlistError } = await supabase
      .from('playlists')
      .update({
        name: playlistName,
        scope,
        branch_id: scope === 'branch' ? branchId : null,
        status,
      })
      .eq('id', playlistRow.id)
      .select('id,name,scope,branch_id,status,created_by,created_at,updated_at')
      .single()
    if (playlistError) {
      throw repositoryError(
        'DATABASE_ERROR',
        'Đã lưu slide nhưng chưa cập nhật được thông tin playlist.',
        playlistError,
      )
    }
    playlistRow = updatedPlaylist as unknown as DbPlaylistRow
  } catch (error) {
    if (newContentIds.length && (!playlistItemsCommitted || createdPlaylist)) {
      await supabase.from('content_items').delete().in('id', newContentIds)
    }
    if (createdPlaylist) {
      await supabase.from('playlists').delete().eq('id', playlistRow.id)
    }
    throw error
  }

  await deleteContentItemsIfUnreferenced(supabase, previousContentIds)
  return loadPlaylistFromSupabase(playlistRow.id)
}

/**
 * Adds or replaces one logical slide, then persists a consistent ordered
 * playlist snapshot. Slide identity is the local PlaylistDraftItem.id.
 */
export const saveSlideToSupabase = async (
  options: SaveSlideOptions,
): Promise<SupabasePlaylistSnapshot> => {
  const current = await loadPlaylistFromSupabase(options.playlistId)
  const existingIndex = current.config.items.findIndex((item) => item.id === options.slide.id)
  const withoutExisting = current.config.items.filter((item) => item.id !== options.slide.id)
  const requestedPosition = options.position ?? (existingIndex >= 0 ? existingIndex : withoutExisting.length)
  const position = Math.max(0, Math.min(withoutExisting.length, requestedPosition))
  withoutExisting.splice(position, 0, options.slide)

  const mediaBySlideId: Record<string, SupabaseSlideMediaBindings> = {}
  for (const entry of current.slides) mediaBySlideId[entry.slide.id] = entry.media
  mediaBySlideId[options.slide.id] = options.media ?? mediaBySlideId[options.slide.id] ?? {}

  return savePlaylistToSupabase(
    {
      ...current.config,
      items: withoutExisting,
      updatedAt: new Date().toISOString(),
    },
    {
      playlistId: current.id,
      scope: current.scope,
      branchId: current.branchId,
      status: current.status,
      mediaBySlideId,
    },
  )
}

/**
 * Removes one slide while retaining every other slide and media binding.
 */
export const deleteSlideFromSupabase = async (
  playlistId: string,
  localSlideId: string,
): Promise<SupabasePlaylistSnapshot> => {
  const current = await loadPlaylistFromSupabase(playlistId)
  const items = current.config.items.filter((item) => item.id !== localSlideId)
  if (items.length === current.config.items.length) {
    throw repositoryError('NOT_FOUND', 'Không tìm thấy slide cần xóa trong playlist.')
  }
  if (!items.length) {
    throw repositoryError(
      'INVALID_INPUT',
      'Không thể xóa slide cuối cùng; playlist cần ít nhất một slide.',
    )
  }

  const mediaBySlideId: Record<string, SupabaseSlideMediaBindings> = {}
  for (const entry of current.slides) {
    if (entry.slide.id !== localSlideId) mediaBySlideId[entry.slide.id] = entry.media
  }
  return savePlaylistToSupabase(
    {
      ...current.config,
      items,
      updatedAt: new Date().toISOString(),
    },
    {
      playlistId: current.id,
      scope: current.scope,
      branchId: current.branchId,
      status: current.status,
      mediaBySlideId,
    },
  )
}

const safePathSegment = (value: string, fallback: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || fallback
}

const inferContentType = (fileName: string) => {
  const extension = fileName.toLowerCase().split('.').pop()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'mp4') return 'video/mp4'
  if (extension === 'webm') return 'video/webm'
  if (extension === 'mp3') return 'audio/mpeg'
  if (extension === 'm4a') return 'audio/mp4'
  return ''
}

/**
 * Uploads a private asset using the exact vinhdanh-media bucket from the
 * migration. The returned path, not a temporary signed URL, should be stored
 * in SupabaseSlideMediaBindings.
 */
export const uploadPlaylistMedia = async (
  input: UploadPlaylistMediaInput,
): Promise<UploadedPlaylistMedia> => {
  if (!input.playlistId || !input.slideId || !input.fileName) {
    throw repositoryError(
      'INVALID_INPUT',
      'Thiếu playlistId, slideId hoặc tên file khi tải media.',
    )
  }
  if (!input.data.size) {
    throw repositoryError('INVALID_INPUT', 'File media đang trống.')
  }
  if (input.data.size > MAX_MEDIA_BYTES) {
    throw repositoryError(
      'INVALID_INPUT',
      'File media vượt quá giới hạn 500 MB của bucket vinhdanh-media.',
    )
  }

  const contentType = input.contentType?.trim()
    || input.data.type
    || inferContentType(input.fileName)
  if (!ALLOWED_MEDIA_TYPES.has(contentType)) {
    throw repositoryError(
      'INVALID_INPUT',
      'Định dạng media chưa được hỗ trợ. Chỉ dùng PNG, JPG, WebP, MP4, WebM, MP3 hoặc M4A.',
    )
  }

  const { supabase } = await requireAdminSession()
  const extension = EXTENSION_BY_MEDIA_TYPE[contentType]
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const path = [
    'playlists',
    safePathSegment(input.playlistId, 'playlist'),
    safePathSegment(input.slideId, 'slide'),
    input.purpose,
    `${randomId}.${extension}`,
  ].join('/')

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, input.data, {
      cacheControl: '31536000',
      contentType,
      upsert: input.upsert ?? false,
    })
  if (error) {
    throw repositoryError(
      'STORAGE_ERROR',
      'Không tải được media lên bucket vinhdanh-media.',
      error,
    )
  }

  return {
    bucket: MEDIA_BUCKET,
    path: data.path,
    contentType,
    size: input.data.size,
    originalName: input.fileName,
  }
}

export const createPlaylistMediaSignedUrl = async (
  path: string,
  expiresInSeconds = 3600,
): Promise<string> => {
  if (!path) throw repositoryError('INVALID_INPUT', 'Thiếu đường dẫn media cần xem.')
  const { supabase } = await requireAdminSession()
  const expiresIn = Math.max(60, Math.min(86_400, Math.round(expiresInSeconds)))
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) {
    throw repositoryError(
      'STORAGE_ERROR',
      'Không tạo được liên kết xem media tạm thời.',
      error,
    )
  }
  return data.signedUrl
}

export const deletePlaylistMedia = async (paths: readonly string[]): Promise<void> => {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)))
  if (!uniquePaths.length) return
  const { supabase } = await requireAdminSession()
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(uniquePaths)
  if (error) {
    throw repositoryError(
      'STORAGE_ERROR',
      'Không xóa được media khỏi bucket vinhdanh-media.',
      error,
    )
  }
}

/**
 * Creates the immutable release candidate required by publish-release.
 * The caller supplies the final TV manifest because recognition entries come
 * from the selected, validated import batch rather than PlaylistConfig alone.
 */
export const createReadyPlaylistRelease = async (
  input: CreateReadyReleaseInput,
): Promise<ReadyReleaseRecord> => {
  if (!input.releaseVersion.trim() || !input.playlistId) {
    throw repositoryError(
      'INVALID_INPUT',
      'Thiếu phiên bản phát hành hoặc playlistId.',
    )
  }
  const { supabase, session } = await requireAdminSession()
  const { data, error } = await supabase
    .from('releases')
    .insert({
      release_version: input.releaseVersion.trim(),
      period_id: input.periodId ?? null,
      import_batch_id: input.importBatchId ?? null,
      playlist_id: input.playlistId,
      parent_release_id: input.parentReleaseId ?? null,
      status: 'ready',
      activate_at: input.activateAt ?? null,
      manifest: toJson(input.manifest),
      target_config: toJson(input.targetConfig ?? { scope: 'all' }),
      created_by: session.user.id,
    })
    .select('id,release_version,playlist_id,status,activate_at,created_at')
    .single()
  if (error) {
    throw repositoryError(
      'DATABASE_ERROR',
      'Không tạo được bản phát hành ở trạng thái READY.',
      error,
    )
  }
  const row = data as unknown as {
    id: string
    release_version: string
    playlist_id: string
    status: 'ready'
    activate_at: string | null
    created_at: string
  }
  return {
    id: row.id,
    releaseVersion: row.release_version,
    playlistId: row.playlist_id,
    status: row.status,
    activateAt: row.activate_at,
    createdAt: row.created_at,
  }
}

/**
 * Invokes the existing publish-release Edge Function with the current Admin
 * access token. Server-side requireOperator remains the source of truth for
 * role authorization.
 */
export const publishReleaseWithAdminSession = async (
  input: PublishReleaseInput,
): Promise<PublishReleaseResult> => {
  if (!input.releaseId) {
    throw repositoryError('INVALID_INPUT', 'Thiếu releaseId cần phát hành.')
  }
  const { supabase, session } = await requireAdminSession()
  const { data, error } = await supabase.functions.invoke(publishReleaseFunction, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      releaseId: input.releaseId,
      activateAt: input.activateAt ?? null,
      screenIds: input.screenIds,
      branchIds: input.branchIds,
    },
  })
  if (error) {
    throw repositoryError(
      'FUNCTION_ERROR',
      'Edge Function publish-release từ chối hoặc không hoàn tất yêu cầu.',
      error,
    )
  }
  if (!isRecord(data) || data.ok !== true || typeof data.releaseId !== 'string') {
    const serverMessage = isRecord(data) && typeof data.message === 'string'
      ? data.message
      : ''
    throw repositoryError(
      'FUNCTION_ERROR',
      serverMessage || 'publish-release trả về dữ liệu không hợp lệ.',
    )
  }
  return {
    ok: true,
    releaseId: data.releaseId,
    releaseVersion: typeof data.releaseVersion === 'string' ? data.releaseVersion : undefined,
    activateAt: typeof data.activateAt === 'string' ? data.activateAt : undefined,
    targets: typeof data.targets === 'number' ? data.targets : undefined,
    broadcastAccepted: typeof data.broadcastAccepted === 'boolean'
      ? data.broadcastAccepted
      : undefined,
  }
}
