const MAX_AVATAR_BYTES = 20 * 1024 * 1024
const MAX_AVATAR_EDGE = 4096
const MAX_AVATAR_PIXELS = 4096 * 4096
const MAX_TV_AVATAR_EDGE = 768
const AVATAR_WEBP_QUALITY = 0.88
const ALLOWED_TYPES = new Set(['image/png', 'image/webp'])

export function hasTransparentPixel(pixels: ArrayLike<number>): boolean {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) return true
  }
  return false
}

export function fitAvatarDimensions(
  width: number,
  height: number,
  maxEdge = MAX_TV_AVATAR_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function validateTransparentAvatarFile(file: File): Promise<{
  width: number
  height: number
}> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Chỉ nhận ảnh PNG hoặc WebP có nền trong suốt.')
  }
  if (!file.size || file.size > MAX_AVATAR_BYTES) {
    throw new Error('Ảnh phải nhỏ hơn hoặc bằng 20 MB.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    if (
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width > MAX_AVATAR_EDGE ||
      bitmap.height > MAX_AVATAR_EDGE ||
      bitmap.width * bitmap.height > MAX_AVATAR_PIXELS
    ) {
      throw new Error('Ảnh tối đa 4096 × 4096 px.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Trình duyệt không thể kiểm tra ảnh này.')
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    if (!hasTransparentPixel(pixels)) {
      throw new Error('Ảnh chưa có nền trong suốt. Hãy xóa nền rồi tải lại.')
    }
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

export async function prepareTransparentAvatarFile(file: File): Promise<{
  file: File
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
}> {
  const source = await validateTransparentAvatarFile(file)
  const target = fitAvatarDimensions(source.width, source.height)
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Trình duyệt không thể tối ưu ảnh này.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, target.width, target.height)

    const webpBlob = await canvasToBlob(canvas, 'image/webp', AVATAR_WEBP_QUALITY)
    const pngBlob = webpBlob?.type === 'image/webp'
      ? null
      : await canvasToBlob(canvas, 'image/png')
    const optimizedBlob = webpBlob?.type === 'image/webp' ? webpBlob : pngBlob
    if (!optimizedBlob) throw new Error('Trình duyệt không thể xuất ảnh đã tối ưu.')

    const shouldUseOptimized = target.width !== source.width
      || target.height !== source.height
      || optimizedBlob.size < file.size
    if (!shouldUseOptimized) {
      return {
        file,
        sourceWidth: source.width,
        sourceHeight: source.height,
        width: source.width,
        height: source.height,
      }
    }

    const outputType = optimizedBlob.type === 'image/webp' ? 'image/webp' : 'image/png'
    const extension = outputType === 'image/webp' ? 'webp' : 'png'
    return {
      file: new File([optimizedBlob], `avatar-tv.${extension}`, {
        type: outputType,
        lastModified: Date.now(),
      }),
      sourceWidth: source.width,
      sourceHeight: source.height,
      width: target.width,
      height: target.height,
    }
  } finally {
    bitmap.close()
  }
}
