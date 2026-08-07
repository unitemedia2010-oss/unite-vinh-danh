import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyRecognitionVisibility,
  isRecognitionBoardHidden,
  isRecognitionPersonHidden,
  normalizeVisibilityKey,
} from './recognitionVisibility.ts'

const boardCodes = {
  'manager-thong-soai': 'QLCN_THONG_SOAI',
  'leader-ky-lan': 'LEADER_KY_LAN',
}

const board = (id, honorees) => ({
  id,
  group: id.startsWith('manager') ? 'manager' : 'leader',
  title: id,
  subtitle: '',
  threshold: '',
  sourceRange: '',
  honorees,
})
const person = (rank, entityCode, name = entityCode) => ({
  rank,
  entityCode,
  name,
  shortName: name,
  role: '',
  team: '',
  branch: '',
  revenue: 1,
  accent: '#fff',
  initials: '',
})

const rule = (targetType, targetKey, hidden = true) => ({
  id: `${targetType}:${targetKey}`,
  periodId: '2026-08',
  targetType,
  targetKey,
  hidden,
  reason: '',
  updatedAt: '2026-08-07T00:00:00Z',
})

test('visibility keys are compared case-insensitively', () => {
  assert.equal(normalizeVisibilityKey(' u177 '), 'U177')
  assert.equal(isRecognitionPersonHidden('u177', [rule('person', ' U177 ')]), true)
  assert.equal(isRecognitionBoardHidden('leader-ky-lan', [rule('board', 'leader_ky_lan')], boardCodes), true)
})

test('one person rule hides every appearance without changing source ranks', () => {
  const source = [
    board('manager-thong-soai', [person(1, 'U177', 'Chị Hà'), person(2, 'U261')]),
    board('leader-ky-lan', [person(3, 'U177', 'Chị Hà'), person(4, 'U708')]),
  ]
  const visible = applyRecognitionVisibility(source, [rule('person', 'U177')], boardCodes)
  assert.deepEqual(visible.map((item) => item.honorees.map((entry) => entry.rank)), [[2], [4]])
  assert.equal(source[0].honorees.length, 2, 'source snapshot must remain untouched')
})

test('a hidden award is omitted and an inactive rule has no effect', () => {
  const source = [
    board('manager-thong-soai', [person(1, 'U177')]),
    board('leader-ky-lan', [person(1, 'U708')]),
  ]
  const visible = applyRecognitionVisibility(source, [
    rule('board', 'QLCN_THONG_SOAI'),
    rule('person', 'U708', false),
  ], boardCodes)
  assert.deepEqual(visible.map((item) => item.id), ['leader-ky-lan'])
})

test('a board with no visible honorees is not delivered as an empty slide', () => {
  const visible = applyRecognitionVisibility(
    [board('leader-ky-lan', [person(1, 'U708')])],
    [rule('person', 'U708')],
    boardCodes,
  )
  assert.deepEqual(visible, [])
})
