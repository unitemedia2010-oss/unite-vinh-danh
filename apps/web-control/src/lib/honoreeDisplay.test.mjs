import test from 'node:test'
import assert from 'node:assert/strict'
import {
  honoreeContextLabel,
  podiumHonorees,
  rankingListHonorees,
} from './honoreeDisplay.ts'

const person = {
  rank: 1,
  name: 'Chị Hà',
  shortName: 'Hà',
  role: 'QLCN CT',
  team: 'QLCN CT',
  branch: 'DOC1',
  revenue: 100,
  initials: 'H',
  accent: '#d7ae45',
}

test('QLCN cards show the ranked region instead of role text', () => {
  assert.equal(honoreeContextLabel('manager', person), 'Khu vực DOC1')
  assert.equal(honoreeContextLabel('manager', { ...person, branch: 'DFC' }), 'Khu vực DFC')
})

test('Leader cards continue to show Team', () => {
  assert.equal(honoreeContextLabel('leader', { ...person, team: 'MONEY' }), 'MONEY')
})

test('temporary hides keep the original podium and list ranks', () => {
  const honorees = [
    { ...person, rank: 1, name: 'Hạng 1' },
    { ...person, rank: 3, name: 'Hạng 3' },
    { ...person, rank: 4, name: 'Hạng 4' },
    { ...person, rank: 7, name: 'Hạng 7' },
  ]
  assert.deepEqual(podiumHonorees(honorees).map((entry) => entry.rank), [1, 3])
  assert.deepEqual(rankingListHonorees(honorees).map((entry) => entry.rank), [4, 7])
})
