import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSheetRankingSettings,
  sameSheetRankingSelection,
  sheetRankingMode,
} from './sheetRankingSettings.ts'

const row = (code, columnIndex, column = '') => ({
  source_id: 'source-1',
  code,
  column_map: code === 'DS_TEAM'
    ? { best_team_metric: { columnIndex } }
    : { manager_metric: { columnIndex } },
  filter_config: column ? { rankingSourceColumn: column } : {},
  updated_at: '2026-07-29T00:00:00.000Z',
})

test('loads legacy O/L mappings by their authoritative B-range positions', () => {
  const settings = parseSheetRankingSettings([
    row('DS_TEAM', 13),
    row('DS_KV', 10),
  ])
  assert.equal(settings.team, 'O')
  assert.equal(settings.manager, 'L')
})

test('loads the early-month M/K preset and rejects metadata/index conflicts', () => {
  const settings = parseSheetRankingSettings([
    row('DS_TEAM', 11, 'M'),
    row('DS_KV', 9, 'K'),
  ])
  assert.equal(sheetRankingMode(settings), 'deposit')
  assert.throws(
    () => parseSheetRankingSettings([
      row('DS_TEAM', 13, 'M'),
      row('DS_KV', 10, 'L'),
    ]),
    /ngoài hai cột được phép/,
  )
})

test('marks mixed metrics and compares only the active selection', () => {
  assert.equal(sheetRankingMode({ team: 'M', manager: 'L' }), 'mixed')
  assert.equal(
    sameSheetRankingSelection(
      { team: 'O', manager: 'L' },
      { team: 'O', manager: 'L' },
    ),
    true,
  )
  assert.equal(
    sameSheetRankingSelection(
      { team: 'M', manager: 'L' },
      { team: 'O', manager: 'L' },
    ),
    false,
  )
})
