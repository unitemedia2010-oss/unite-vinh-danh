import { access, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '../public')
const defaultSourcePath = 'C:/Users/ADMIN/Downloads/lfsh/2.png'
const sourcePath = resolve(process.argv[2] ?? process.env.UNITE_MARK_SOURCE ?? defaultSourcePath)

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
const maskableBackground = { r: 9, g: 11, b: 16, alpha: 1 }

const outputs = [
  { fileName: 'favicon-32.png', size: 32, contentRatio: 0.86, background: transparent },
  { fileName: 'favicon-48.png', size: 48, contentRatio: 0.86, background: transparent },
  { fileName: 'apple-touch-icon-180.png', size: 180, contentRatio: 0.86, background: transparent },
  { fileName: 'icon-192.png', size: 192, contentRatio: 0.86, background: transparent },
  { fileName: 'icon-512.png', size: 512, contentRatio: 0.86, background: transparent },
  { fileName: 'icon-maskable-192.png', size: 192, contentRatio: 0.70, background: maskableBackground },
  { fileName: 'icon-maskable-512.png', size: 512, contentRatio: 0.70, background: maskableBackground },
]

async function renderIcon(mark, { fileName, size, contentRatio, background }) {
  const contentSize = Math.max(1, Math.round(size * contentRatio))
  const resizedMark = await sharp(mark)
    .resize({
      width: contentSize,
      height: contentSize,
      fit: 'contain',
      background: transparent,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()

  const outputPath = join(publicDir, fileName)
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: resizedMark, gravity: 'centre' }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath)

  console.log(`Created ${fileName}: ${size}x${size}, mark ${Math.round(contentRatio * 100)}%`)
}

async function run() {
  await access(sourcePath)
  await mkdir(publicDir, { recursive: true })

  // The supplied logo already has transparency. Trim only transparent padding;
  // never remove bright pixels because they are part of the gold highlights.
  const trimmedMark = await sharp(sourcePath)
    .ensureAlpha()
    .trim({ background: transparent, threshold: 2 })
    .png()
    .toBuffer()

  for (const output of outputs) {
    await renderIcon(trimmedMark, output)
  }

  console.log('Finished generating safe-padded Unite icons.')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
