import test from 'node:test'
import assert from 'node:assert/strict'
import { honoreeContextLabel } from './honoreeDisplay.ts'

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
