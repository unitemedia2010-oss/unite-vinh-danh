const MAX_AVATAR_BYTES = 20 * 1024 * 1024
const MAX_AVATAR_EDGE = 4096
const MAX_AVATAR_PIXELS = 4096 * 4096
const ALLOWED_TYPES = new Set(['image/png', 'image/webp'])

export function hasTransparentPixel(pixels: ArrayLike<number>): boolean {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) return true
  }
  return false
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
