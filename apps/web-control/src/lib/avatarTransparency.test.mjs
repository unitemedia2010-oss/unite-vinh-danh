import test from 'node:test'
import assert from 'node:assert/strict'
import { fitAvatarDimensions, hasTransparentPixel } from './avatarTransparency.ts'

test('accepts pixel data when at least one alpha channel is transparent', () => {
  assert.equal(hasTransparentPixel(new Uint8ClampedArray([
    10, 20, 30, 255,
    40, 50, 60, 0,
  ])), true)
})

test('rejects pixel data when every pixel is fully opaque', () => {
  assert.equal(hasTransparentPixel(new Uint8ClampedArray([
    10, 20, 30, 255,
    40, 50, 60, 255,
  ])), false)
})

test('fits oversized portrait avatars without changing their aspect ratio', () => {
  assert.deepEqual(fitAvatarDimensions(1215, 1519), {
    width: 614,
    height: 768,
  })
  assert.deepEqual(fitAvatarDimensions(500, 700), {
    width: 500,
    height: 700,
  })
})
