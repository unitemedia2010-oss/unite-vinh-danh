import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sampleRate = 48_000
const seconds = 2.9
const frames = Math.floor(sampleRate * seconds)
const channels = 2
const dataSize = frames * channels * 2
const buffer = Buffer.alloc(44 + dataSize)

buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + dataSize, 4)
buffer.write('WAVE', 8)
buffer.write('fmt ', 12)
buffer.writeUInt32LE(16, 16)
buffer.writeUInt16LE(1, 20)
buffer.writeUInt16LE(channels, 22)
buffer.writeUInt32LE(sampleRate, 24)
buffer.writeUInt32LE(sampleRate * channels * 2, 28)
buffer.writeUInt16LE(channels * 2, 32)
buffer.writeUInt16LE(16, 34)
buffer.write('data', 36)
buffer.writeUInt32LE(dataSize, 40)

let seed = 0x7f4a7c15
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0xffffffff
}

for (let i = 0; i < frames; i += 1) {
  const t = i / sampleRate
  const riserPhase = 2 * Math.PI * (54 * t + 86 * t * t)
  const riserEnv = Math.sin(Math.min(1, t / 1.62) * Math.PI / 2) * Math.max(0, Math.min(1, (2.55 - t) / 0.52))
  const riser = Math.sin(riserPhase) * 0.12 * riserEnv

  const impactT = Math.max(0, t - 1.42)
  const impact = t >= 1.42
    ? (Math.sin(2 * Math.PI * (58 - Math.min(18, impactT * 12)) * impactT) * 0.42 + (random() * 2 - 1) * 0.18) * Math.exp(-impactT * 4.8)
    : 0

  const chimeT = Math.max(0, t - 1.63)
  const chime = t >= 1.63
    ? (Math.sin(2 * Math.PI * 880 * chimeT) * 0.08 + Math.sin(2 * Math.PI * 1320 * chimeT) * 0.045) * Math.exp(-chimeT * 2.8)
    : 0

  const air = (random() * 2 - 1) * 0.018 * riserEnv
  const sample = Math.tanh((riser + impact + chime + air) * 1.18)
  const pan = Math.sin(t * Math.PI * 0.75) * 0.08
  const left = Math.max(-1, Math.min(1, sample * (1 - pan)))
  const right = Math.max(-1, Math.min(1, sample * (1 + pan)))
  const offset = 44 + i * 4
  buffer.writeInt16LE(Math.round(left * 32767), offset)
  buffer.writeInt16LE(Math.round(right * 32767), offset + 2)
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'public', 'cinematic-impact.wav')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, buffer)
console.log(`Generated ${output}`)
