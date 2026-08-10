import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const recognitionDir = join(__dirname, '../public/recognition')
const sourcePath = join(recognitionDir, 'background-red-crystal.png')
const outputPath = join(recognitionDir, 'background-red-crystal-ultra-v2.webp')

async function run() {
  await access(sourcePath)

  await sharp(sourcePath)
    .modulate({ brightness: 1.2 })
    .webp({
      quality: 82,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(outputPath)

  const metadata = await sharp(outputPath).metadata()
  console.log(`Created ${outputPath} (${metadata.width}x${metadata.height})`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
