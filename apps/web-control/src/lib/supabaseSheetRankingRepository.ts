import {
  getSupabase,
  sheetSourceId,
  sheetSourceRowId,
} from './supabase'
import {
  parseSheetRankingSettings,
  type SheetMappingSettingRow,
  type SheetRankingSelection,
  type SheetRankingSettings,
} from './sheetRankingSettings'

const requireSupabase = () => {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')
  return supabase
}

const requireSignedInSupabase = async () => {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session?.access_token) {
    throw new Error('Admin cần đăng nhập Supabase để xem và đổi cột xếp hạng.')
  }
  return supabase
}

const resolveSheetSourceId = async () => {
  if (sheetSourceRowId) return sheetSourceRowId
  const supabase = await requireSignedInSupabase()
  const { data, error } = await supabase
    .from('sheet_sources')
    .select('id')
    .eq('spreadsheet_id', sheetSourceId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Không tìm thấy nguồn Google Sheet đang hoạt động.')
  return String(data.id)
}

export async function loadSheetRankingSettings(): Promise<SheetRankingSettings> {
  const supabase = await requireSignedInSupabase()
  const sourceId = await resolveSheetSourceId()
  const { data, error } = await supabase
    .from('sheet_mappings')
    .select('source_id,code,column_map,filter_config,updated_at')
    .eq('source_id', sourceId)
    .eq('is_active', true)
    .in('code', ['DS_TEAM', 'DS_KV'])
  if (error) throw error
  return parseSheetRankingSettings((data ?? []) as SheetMappingSettingRow[])
}

type SaveRankingColumnsResult = {
  changed?: boolean
  sourceId?: string
  teamColumn?: string
  managerColumn?: string
  teamLabel?: string
  managerLabel?: string
  teamUpdatedAt?: string
  managerUpdatedAt?: string
}

export async function saveSheetRankingSettings(
  current: SheetRankingSettings,
  selection: SheetRankingSelection,
): Promise<{ changed: boolean; settings: SheetRankingSettings }> {
  const supabase = await requireSignedInSupabase()
  const { data, error } = await supabase.rpc('save_vinhdanh_ranking_columns', {
    p_spreadsheet_id: sheetSourceId,
    p_team_column: selection.team,
    p_manager_column: selection.manager,
    p_expected_team_updated_at: current.teamUpdatedAt,
    p_expected_manager_updated_at: current.managerUpdatedAt,
  })
  if (error) throw error

  const result = (data ?? {}) as SaveRankingColumnsResult
  if (
    result.teamColumn !== selection.team ||
    result.managerColumn !== selection.manager ||
    !result.sourceId ||
    !result.teamUpdatedAt ||
    !result.managerUpdatedAt
  ) {
    throw new Error('Supabase trả về cấu hình cột không hợp lệ.')
  }

  return {
    changed: result.changed === true,
    settings: {
      sourceId: result.sourceId,
      team: selection.team,
      manager: selection.manager,
      teamLabel: result.teamLabel || `DS-TEAM cột ${selection.team}`,
      managerLabel: result.managerLabel || `DS-KV cột ${selection.manager}`,
      teamUpdatedAt: result.teamUpdatedAt,
      managerUpdatedAt: result.managerUpdatedAt,
    },
  }
}
