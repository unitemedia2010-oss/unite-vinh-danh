import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canStartIntro,
  isAutoplayBlockedError,
  parseVisualMode,
  resolveVisualMode,
  shouldReplayIntroOnAutomaticWrap,
  shouldRetryIntroMuted,
  visualModeOverride,
} from './visualMode.ts'

test('normalizes only supported visual modes', () => {
  assert.equal(parseVisualMode(' Standard '), 'standard')
  assert.equal(parseVisualMode('ULTRA'), 'ultra')
  assert.equal(parseVisualMode('cinematic'), null)
  assert.equal(parseVisualMode(null), null)
})

test('paired screens follow the presentation mode from Admin', () => {
  const params = new URLSearchParams()
  assert.equal(resolveVisualMode(params, 'paired', { visualMode: 'lite' }), 'lite')
  assert.equal(resolveVisualMode(params, 'paired', { visualMode: 'standard' }), 'standard')
  assert.equal(resolveVisualMode(params, 'paired', { visualMode: 'ultra' }), 'ultra')
  assert.equal(resolveVisualMode(params, 'paired', { visualMode: 'invalid' }), 'ultra')
})

test('public TV and public share default to Ultra', () => {
  const params = new URLSearchParams()
  assert.equal(resolveVisualMode(params, 'public'), 'ultra')
  assert.equal(resolveVisualMode(params, 'share'), 'ultra')
  assert.equal(resolveVisualMode(new URLSearchParams('mode=standard'), 'public'), 'ultra')
  assert.equal(resolveVisualMode(new URLSearchParams('lite=1'), 'share'), 'ultra')
})

test('explicit support links override paired screens only', () => {
  assert.equal(resolveVisualMode(new URLSearchParams('mode=standard'), 'paired'), 'standard')
  assert.equal(resolveVisualMode(new URLSearchParams('lite=1'), 'paired', { visualMode: 'ultra' }), 'lite')
  assert.equal(visualModeOverride(new URLSearchParams('lite=0')), 'ultra')
})

test('intro starts only after a real playlist release is ready', () => {
  assert.equal(canStartIntro('ultra', true, true, 'release-1'), true)
  assert.equal(canStartIntro('ultra', false, true, 'release-1'), false)
  assert.equal(canStartIntro('ultra', true, false, 'release-1'), false)
  assert.equal(canStartIntro('ultra', true, true, null), false)
  assert.equal(canStartIntro('standard', true, true, 'release-1'), false)
})

test('only an automatic repeating last-to-first transition replays intro', () => {
  assert.equal(shouldReplayIntroOnAutomaticWrap('ultra', 2, 3, true), true)
  assert.equal(shouldReplayIntroOnAutomaticWrap('ultra', 1, 3, true), false)
  assert.equal(shouldReplayIntroOnAutomaticWrap('ultra', 2, 3, false), false)
  assert.equal(shouldReplayIntroOnAutomaticWrap('standard', 2, 3, true), false)
})

test('detects autoplay policy errors without depending on DOM globals', () => {
  assert.equal(isAutoplayBlockedError({ name: 'NotAllowedError' }), true)
  assert.equal(isAutoplayBlockedError({ name: 'AbortError' }), false)
  assert.equal(isAutoplayBlockedError(null), false)
})

test('retries an audio-blocked intro muted but does not loop other media failures', () => {
  assert.equal(shouldRetryIntroMuted(false, { name: 'NotAllowedError' }), true)
  assert.equal(shouldRetryIntroMuted(true, { name: 'NotAllowedError' }), false)
  assert.equal(shouldRetryIntroMuted(false, { name: 'NotSupportedError' }), false)
})
