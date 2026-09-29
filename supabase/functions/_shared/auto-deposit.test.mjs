import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticRankingMapping, normalizeAutomaticRanking, sheetColumnLetter } from './auto-deposit.ts';
import { resolveSheetPeriod } from './sheet-period.ts';
import { deriveBestTeamContributions } from './best-team.ts';
import { deriveLeaderAwards } from './leader.ts';
import { deriveQlcnAwards } from './qlcn.ts';

const kvHeaders = ['STT', 'CỤM', 'KHU VỰC', 'QLCN', 'MNV', 'CẤP BẬC', 'CỌC RVT9', 'GDTC RVT9', 'CỌC T9', 'GDTC T9', 'TỔNG CỌC T9', 'TỔNG GDTC+HC T9', 'GDTC XÉT BEST KV', 'BẢNG ĐẤU'];
const teamHeaders = ['', '', 'STT', 'TEAM', 'LEADER', 'MNV', 'CẤP BẬC', 'KHU VỰC', 'CỤM', 'CỌC RVT9', 'GDTC RVT9', 'CỌC T9', 'GDTC T9', 'TỔNG CỌC T9', 'TỔNG GDTC+HC T9', '', 'BẢNG ĐẤU'];
const mapping = code => ({
  id: code, code, sheet_name: code.replace('_', '-'), entity_type: code === 'DS_KV' ? 'branch_manager' : 'team',
  range_a1: 'B1:S1000', title_row: 1, header_row: 2, data_start_row: 3,
  column_map: { manager_metric: { columnIndex: 9 }, best_team_metric: { columnIndex: 14 } },
  filter_config: { selectedRevenueField: 'wrong_field', rankingSourceColumn: 'P', rankingSourceMode: 'gdtc' },
});
function fixture(code, headers = code === 'DS_KV' ? kvHeaders : teamHeaders, period = 'T9/2026') {
  const values = { STT: '1', TEAM: 'TEAM-A', QLCN: 'Quản lý thử', LEADER: 'Leader thử', MNV: 'U001', 'CẤP BẬC': code === 'DS_KV' ? 'QLCN TV' : 'Leader CT', 'KHU VỰC': 'LTC', 'BẢNG ĐẤU': code === 'DS_KV' ? 'TƯỚNG QUÂN' : 'KỲ LÂN' };
  return [[`DOANH SỐ ${period}`], [...headers], headers.map(h => values[h] ?? (h.startsWith('TỔNG CỌC') ? '222.122.450' : h.includes('CỌC') ? '123.000' : h.includes('GDTC') ? '999.000' : ''))];
}
test('real screenshot layouts detect K and N, superseding stale positions; awards use total deposits', () => {
  const kv = normalizeAutomaticRanking(fixture('DS_KV'), mapping('DS_KV'));
  const teamMatrix = fixture('DS_TEAM');
  const topTotal = teamHeaders.map(h => h === 'STT' ? 'TỔNG' : '');
  teamMatrix.splice(2, 0, topTotal);
  const team = normalizeAutomaticRanking(teamMatrix, mapping('DS_TEAM'));
  for (const result of [kv, team]) {
    assert.deepEqual(result.normalized.blockingErrors, []);
    assert.equal(result.normalized.periodId, '2026-09');
    assert.equal(result.normalized.rows.length, 1);
    assert.equal(result.normalized.rows[0].revenueVnd, 222122450);
  }
  assert.equal(kv.rankingSource.column, 'K');
  assert.equal(team.rankingSource.column, 'N');
  assert.equal(team.normalized.rows[0].sourceRowNumber, 4);
  assert.equal(deriveBestTeamContributions(team.normalized.rows).contributions[0].revenueVnd, 222122450);
  assert.equal(deriveLeaderAwards(team.normalized.rows).awards[0].revenueVnd, 222122450);
  assert.equal(deriveQlcnAwards(kv.normalized.rows).awards[0].revenueVnd, 222122450);
});
test('columns and header row can shift without losing identity or source row number', () => {
  const headers = [...kvHeaders].reverse();
  const matrix = fixture('DS_KV', headers);
  matrix.splice(1, 0, [], []);
  const result = normalizeAutomaticRanking(matrix, mapping('DS_KV'));
  assert.deepEqual(result.normalized.blockingErrors, []);
  assert.equal(result.rankingSource.column, 'D');
  assert.equal(result.rankingSource.headerRow, 4);
  // Raw mode has real physical rows, not Visualization's collapsed labels.
  assert.equal(result.normalized.rows[0].sourceRowNumber, 5);
  assert.equal(result.normalized.rows[0].entityCode, 'U001');
  assert.equal(sheetColumnLetter(51), 'AZ');
});
test('new month, padded month, case/accent/whitespace normalization', () => {
  for (const header of ['TỔNG CỌC T10', 'tong coc t10', '  Tổng\u00a0cọc\nT 10  ', 'TỔNG CỌC T01']) {
    const month = header.endsWith('T01') ? '1' : '10';
    const matrix = fixture('DS_KV', kvHeaders.map(h => h === 'TỔNG CỌC T9' ? header : h), `T${month}/2027`);
    matrix[2][10] = '42.000';
    const result = normalizeAutomaticRanking(matrix, mapping('DS_KV'));
    assert.deepEqual(result.normalized.blockingErrors, []);
    assert.equal(result.normalized.periodId, `2027-${month.padStart(2, '0')}`);
    assert.equal(result.normalized.rows[0].revenueVnd, 42000);
  }
});
test('missing/invalid/partial totals never fall back to a fixed index or another money field', () => {
  for (const header of ['', 'CỌC T9', 'TỔNG CỌC RVT9', 'TỔNG CỌC T13', 'TỔNG CỌC T9 DỰ KIẾN']) {
    const matrix = fixture('DS_KV', kvHeaders.map(h => h === 'TỔNG CỌC T9' ? header : h));
    const result = normalizeAutomaticRanking(matrix, mapping('DS_KV'));
    assert.ok(result.normalized.blockingErrors.length > 0);
    assert.equal(result.rankingSource.column, '');
    assert.equal(result.normalized.rows[0].revenueVnd, null);
  }
});
test('duplicate total columns including different months are blocked', () => {
  for (const extra of ['TỔNG CỌC T9', 'TỔNG CỌC T10']) {
    const result = normalizeAutomaticRanking(fixture('DS_KV', [...kvHeaders, extra]), mapping('DS_KV'));
    assert.ok(result.normalized.blockingErrors.some(s => s.includes('2 cột')));
    assert.equal(result.rankingSource.column, '');
  }
});
test('each required identity/board header must be unique', () => {
  for (const header of ['STT', 'MNV', 'QLCN', 'KHU VỰC', 'CẤP BẬC', 'BẢNG ĐẤU']) {
    for (const headers of [kvHeaders.filter(h => h !== header), [...kvHeaders, header]]) {
      assert.ok(normalizeAutomaticRanking(fixture('DS_KV', headers), mapping('DS_KV')).normalized.blockingErrors.length);
    }
  }
});
test('missing year, title mismatch and cross-tab mismatch block automatic publication', () => {
  for (const period of ['T9', 'T10/2026']) {
    assert.ok(normalizeAutomaticRanking(fixture('DS_KV', kvHeaders, period), mapping('DS_KV')).normalized.blockingErrors.length);
  }
  assert.equal(resolveSheetPeriod(new Set(['2026-09', '2026-10'])).error, 'SOURCE_PERIOD_CONFLICT');
});
test('stops at closing total, excludes secondary section and non-numeric rank labels', () => {
  const matrix = fixture('DS_KV');
  const total = kvHeaders.map(h => h === 'STT' ? 'TỔNG' : '');
  matrix.push(total, ['DOANH SỐ GIÁM ĐỐC T9/2026'], ...fixture('DS_KV').slice(1));
  const bogus = [...matrix[2]]; bogus[0] = 'GHI CHÚ 2'; matrix.splice(2, 0, bogus);
  assert.equal(normalizeAutomaticRanking(matrix, mapping('DS_KV')).normalized.rows.length, 1);
});
test('formula errors and blank amount block, zero remains a valid individual amount', () => {
  for (const amount of ['', '#REF!', '#N/A', 'chưa có']) {
    const matrix = fixture('DS_KV'); matrix[2][10] = amount;
    assert.ok(normalizeAutomaticRanking(matrix, mapping('DS_KV')).normalized.blockingErrors.length);
  }
  const matrix = fixture('DS_KV'); matrix[2][10] = '0';
  assert.deepEqual(normalizeAutomaticRanking(matrix, mapping('DS_KV')).normalized.blockingErrors, []);
});
test('unrelated mappings preserve their existing policy', () => {
  const other = mapping('OTHER'); assert.equal(automaticRankingMapping(other), other);
});
test('Visualization collapsed headers and erased subtotal labels preserve period, columns and table boundary', () => {
  for (const code of ['DS_KV', 'DS_TEAM']) {
    const matrix = fixture(code);
    const headers = matrix[1];
    const rankIndex = headers.indexOf('STT');
    headers[rankIndex] = `${matrix[0][0]}    STT`;
    const collapsed = matrix.slice(1);
    const aggregate = headers.map(h => h === 'TỔNG CỌC T9' ? '222.122.450' : '');
    if (code === 'DS_TEAM') collapsed.splice(1, 0, aggregate);
    collapsed.push(aggregate, [], ...fixture(code).slice(1));
    const result = normalizeAutomaticRanking(collapsed, mapping(code), true);
    assert.deepEqual(result.normalized.blockingErrors, []);
    assert.equal(result.normalized.rows.length, 1);
    assert.equal(result.normalized.rows[0].sourceRowNumber, code === 'DS_TEAM' ? 4 : 3);
    assert.equal(result.rankingSource.headerRow, 2);
    assert.equal(result.rankingSource.periodId, '2026-09');
    assert.equal(result.rankingSource.column, code === 'DS_TEAM' ? 'N' : 'K');
  }
});
