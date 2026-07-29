import test from 'node:test'
import assert from 'node:assert/strict'
import { hasTransparentPixel } from './avatarTransparency.ts'

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
