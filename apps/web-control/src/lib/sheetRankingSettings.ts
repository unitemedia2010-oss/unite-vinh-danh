export type TeamRankingColumn = 'N' | 'P'
export type ManagerRankingColumn = 'K' | 'L'

export type SheetRankingSelection = {
  team: TeamRankingColumn
  manager: ManagerRankingColumn
}

export type SheetRankingSettings = SheetRankingSelection & {
  sourceId: string
  teamLabel: string
  managerLabel: string
  teamUpdatedAt: string
  managerUpdatedAt: string
}

export type SheetMappingSettingRow = {
  source_id: string
  code: string
  column_map: unknown
  filter_config: unknown
  updated_at: string
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const metricColumnIndex = (row: SheetMappingSettingRow, field: string) => {
  const columnMap = asRecord(row.column_map)
  const rule = asRecord(columnMap[field])
  return typeof rule.columnIndex === 'number' ? rule.columnIndex : Number(rule.columnIndex)
}

const configuredColumn = (row: SheetMappingSettingRow) => {
  const filterConfig = asRecord(row.filter_config)
  return typeof filterConfig.rankingSourceColumn === 'string'
    ? filterConfig.rankingSourceColumn.toUpperCase()
    : ''
}

const configuredLabel = (row: SheetMappingSettingRow) => {
  const filterConfig = asRecord(row.filter_config)
  return typeof filterConfig.rankingSourceLabel === 'string'
    ? filterConfig.rankingSourceLabel.trim()
    : ''
}

const teamColumnFromRow = (row: SheetMappingSettingRow): TeamRankingColumn => {
  const column = configuredColumn(row)
  const index = metricColumnIndex(row, 'best_team_metric')
  if ((column === 'N' || !column) && index === 12) return 'N'
  if ((column === 'P' || !column) && index === 14) return 'P'
  return column === 'P' ? 'P' : 'N'
}

const managerColumnFromRow = (row: SheetMappingSettingRow): ManagerRankingColumn => {
  const column = configuredColumn(row)
  const index = metricColumnIndex(row, 'manager_metric')
  if ((column === 'K' || !column) && index === 9) return 'K'
  if ((column === 'L' || !column) && index === 10) return 'L'
  return column === 'L' ? 'L' : 'K'
}

export const teamRankingLabel = (column: TeamRankingColumn) =>
  column === 'N'
    ? 'DS-TEAM cột N · TỔNG CỌC Tn'
    : 'DS-TEAM cột P · GDTC XÉT BEST TEAM'

export const managerRankingLabel = (column: ManagerRankingColumn) =>
  column === 'K'
    ? 'DS-KV cột K · TỔNG CỌC Tn'
    : 'DS-KV cột L · TỔNG GDTC+HC Tn'

export function parseSheetRankingSettings(
  rows: SheetMappingSettingRow[],
): SheetRankingSettings {
  const teamRow = rows.find((row) => row.code === 'DS_TEAM')
  const managerRow = rows.find((row) => row.code === 'DS_KV')
  if (!teamRow || !managerRow || teamRow.source_id !== managerRow.source_id) {
    throw new Error('Không tìm thấy đủ hai mapping DS-TEAM và DS-KV cùng nguồn.')
  }

  const team = teamColumnFromRow(teamRow)
  const manager = managerColumnFromRow(managerRow)
  return {
    sourceId: teamRow.source_id,
    team,
    manager,
    teamLabel: configuredLabel(teamRow) || teamRankingLabel(team),
    managerLabel: configuredLabel(managerRow) || managerRankingLabel(manager),
    teamUpdatedAt: teamRow.updated_at,
    managerUpdatedAt: managerRow.updated_at,
  }
}

export function sheetRankingMode(
  selection: SheetRankingSelection,
): 'deposit' | 'gdtc' | 'mixed' {
  if (selection.team === 'N' && selection.manager === 'K') return 'deposit'
  if (selection.team === 'P' && selection.manager === 'L') return 'gdtc'
  return 'mixed'
}

export const sameSheetRankingSelection = (
  left: SheetRankingSelection,
  right: SheetRankingSelection,
) => left.team === right.team && left.manager === right.manager
