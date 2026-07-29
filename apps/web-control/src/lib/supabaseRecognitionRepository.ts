import type { SupabaseClient } from '@supabase/supabase-js'
import { boards as mockBoards } from '../data/mock'
import type { Board, Honoree } from '../types'
import { getSupabase } from './supabase'
import { SUPABASE_BOARD_CODE_BY_LOCAL_ID } from './supabasePlaylistRepository'

type JsonRecord = Record<string, unknown>

const LOCAL_BOARD_ID_BY_SUPABASE_CODE = Object.fromEntries(
  Object.entries(SUPABASE_BOARD_CODE_BY_LOCAL_ID).map(([localId, code]) => [code, localId]),
) as Readonly<Record<string, string>>

const accents = [
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

export type RecognitionBatchStatus =
  | 'importing'
  | 'imported'
  | 'needs_review'
  | 'validated'
  | 'failed'
  | 'archived'

export interface RecognitionImportBatch {
  id: string
  sourceId: string
  periodId: string
  sequence: number
  status: RecognitionBatchStatus
  sourceHash: string
  sourceUpdatedAt: string | null
  importedBy: string | null
  importedAt: string
  rowCount: number
  warningCount: number
  warnings: unknown[]
  metadata: JsonRecord
}

export interface RecognitionBatchSnapshot {
  batch: RecognitionImportBatch
  boards: Board[]
}

type BatchRow = {
  id: string
  source_id: string
  period_id: string
  sequence: number
  status: RecognitionBatchStatus
  source_hash: string
  source_updated_at: string | null
  imported_by: string | null
  imported_at: string
  row_count: number
  warning_count: number
  warnings: unknown
  metadata: unknown
}

type AwardBoardRow = {
  id: string
  code: string
  name: string
  audience_type: string
  tier_order: number
  rank_limit: number | null
  layout_key: string
  rule_config: unknown
  theme: unknown
}

type AwardResultRow = {
  id: string
  rank: number
  display_name: string
  entity_code: string | null
  branch_code: string | null
  team_code: string | null
  role_label: string | null
  revenue_vnd: number | string | null
  display_revenue: string | null
  photo_path: string | null
  needs_review: boolean
  metadata: unknown
  board: AwardBoardRow | AwardBoardRow[] | null
}

const requireSession = async () => {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw error || new Error('Admin cần đăng nhập để đọc dữ liệu Sheet đã nhập.')
  return { supabase, userId: data.session.user.id }
}

const recordValue = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}

const batchFromRow = (row: BatchRow): RecognitionImportBatch => ({
  id: row.id,
  sourceId: row.source_id,
  periodId: row.period_id,
  sequence: row.sequence,
  status: row.status,
  sourceHash: row.source_hash,
  sourceUpdatedAt: row.source_updated_at,
  importedBy: row.imported_by,
  importedAt: row.imported_at,
  rowCount: row.row_count,
  warningCount: row.warning_count,
  warnings: Array.isArray(row.warnings) ? row.warnings : [],
  metadata: recordValue(row.metadata),
})

const shortName = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words.slice(-2).join(' ') || name
}

const initials = (name: string) => name
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(-2)
  .map((word) => word[0]?.toUpperCase() ?? '')
  .join('')

const boardGroup = (audienceType: string, localId: string): Board['group'] => {
  if (localId.startsWith('manager-') || audienceType === 'branch_manager') return 'manager'
  if (localId.startsWith('leader-') || audienceType === 'leader') return 'leader'
  if (localId.includes('fulltime') || audienceType === 'sale_full_time') return 'fulltime'
  if (localId.includes('parttime') || audienceType === 'sale_part_time') return 'parttime'
  return 'team'
}

const resolvePhotoUrls = async (
  supabase: SupabaseClient,
  rows: AwardResultRow[],
): Promise<Map<string, string>> => {
  const paths = Array.from(new Set(rows.map((row) => row.photo_path).filter((path): path is string => Boolean(path))))
  if (!paths.length) return new Map()
  const { data, error } = await supabase.storage.from('employee-photos').createSignedUrls(paths, 60 * 60)
  if (error) return new Map()
  const urls = new Map<string, string>()
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return urls
}

const boardsFromResults = async (
  supabase: SupabaseClient,
  batch: RecognitionImportBatch,
  rows: AwardResultRow[],
): Promise<Board[]> => {
  const photoUrls = await resolvePhotoUrls(supabase, rows)
  const grouped = new Map<string, { board: AwardBoardRow; results: AwardResultRow[] }>()
  for (const row of rows) {
    const board = Array.isArray(row.board) ? row.board[0] : row.board
    if (!board?.code) continue
    const current = grouped.get(board.code) ?? { board, results: [] }
    current.results.push(row)
    grouped.set(board.code, current)
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.board.tier_order - right.board.tier_order)
    .map(({ board, results }) => {
      const localId = LOCAL_BOARD_ID_BY_SUPABASE_CODE[board.code] ?? `supabase-${board.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const fallback = mockBoards.find((candidate) => candidate.id === localId)
      const honorees: Honoree[] = results
        .slice()
        .sort((left, right) => left.rank - right.rank)
        .map((row, index) => {
          const metadata = recordValue(row.metadata)
          const name = row.display_name
          const revenue = Number(row.revenue_vnd ?? 0)
          return {
            rank: row.rank,
            entityCode: row.entity_code ?? undefined,
            name,
            shortName: typeof metadata.short_name === 'string' ? metadata.short_name : shortName(name),
            role: row.role_label ?? '',
            team: row.team_code ?? row.role_label ?? '',
            branch: row.branch_code ?? '',
            revenue: Number.isFinite(revenue) ? revenue : 0,
            accent: typeof metadata.accent === 'string' ? metadata.accent : accents[index % accents.length],
            initials: initials(name),
            photoUrl: row.photo_path ? photoUrls.get(row.photo_path) : undefined,
            photoPath: row.photo_path ?? undefined,
          }
        })
      return {
        id: localId,
        group: fallback?.group ?? boardGroup(board.audience_type, localId),
        title: board.name || fallback?.title || board.code,
        subtitle: fallback?.subtitle || `VINH DANH ${batch.periodId}`,
        threshold: fallback?.threshold || `Kết quả đã duyệt kỳ ${batch.periodId}`,
        sourceRange: `Supabase · lô #${batch.sequence} · ${batch.periodId}`,
        honorees,
      }
    })
}

export const listRecognitionImportBatches = async (limit = 12): Promise<RecognitionImportBatch[]> => {
  const { supabase } = await requireSession()
  const { data, error } = await supabase
    .from('import_batches')
    .select('id,source_id,period_id,sequence,status,source_hash,source_updated_at,imported_by,imported_at,row_count,warning_count,warnings,metadata')
    .order('imported_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as BatchRow[]).map(batchFromRow)
}

export const loadLatestRecognitionBatch = async (
  options: { validatedOnly?: boolean } = {},
): Promise<RecognitionBatchSnapshot | null> => {
  const { supabase } = await requireSession()
  let query = supabase
    .from('import_batches')
    .select('id,source_id,period_id,sequence,status,source_hash,source_updated_at,imported_by,imported_at,row_count,warning_count,warnings,metadata')
    .order('imported_at', { ascending: false })
    .limit(1)
  if (options.validatedOnly) query = query.eq('status', 'validated')
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) return null
  const batch = batchFromRow(data as BatchRow)
  const { data: resultData, error: resultError } = await supabase
    .from('award_results')
    .select('id,rank,display_name,entity_code,branch_code,team_code,role_label,revenue_vnd,display_revenue,photo_path,needs_review,metadata,board:award_boards!inner(id,code,name,audience_type,tier_order,rank_limit,layout_key,rule_config,theme)')
    .eq('batch_id', batch.id)
    .order('rank', { ascending: true })
  if (resultError) throw resultError
  return {
    batch,
    boards: await boardsFromResults(supabase, batch, (resultData ?? []) as unknown as AwardResultRow[]),
  }
}

/**
 * Uses the guarded server RPC: the server verifies the operator role, checks
 * that the warning count has not changed, requires a note for warning-bearing
 * batches, validates blocking rows, and writes the audit trail atomically.
 */
export const approveRecognitionImportBatch = async (input: {
  batchId: string
  expectedWarningCount: number
  note?: string
}): Promise<void> => {
  const { supabase } = await requireSession()
  const { error } = await supabase.rpc('approve_vinhdanh_import_batch', {
    p_batch_id: input.batchId,
    p_expected_warning_count: input.expectedWarningCount,
    p_note: input.note?.trim() || null,
  })
  if (error) throw error
}

export const recognitionWarningText = (warning: unknown): string => {
  if (typeof warning === 'string') return warning
  const record = recordValue(warning)
  for (const key of ['message', 'detail', 'code', 'warning']) {
    if (typeof record[key] === 'string' && record[key]) return record[key]
  }
  try {
    return JSON.stringify(warning)
  } catch {
    return 'Cảnh báo dữ liệu không xác định'
  }
}
