/**
 * Public recognition images are also injected into CSS custom properties.
 * With Vite's relative `base: './'`, leaving these URLs relative makes CSS
 * resolve them beside the hashed stylesheet (`/assets/recognition/...`)
 * instead of beside index.html. Return an absolute URL in the browser so the
 * same asset works for both `<img src>` and `background-image`.
 */
const recognitionAsset = (fileName: string) => {
  const path = `${import.meta.env.BASE_URL}recognition/${fileName}`
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href
}

export interface RecognitionVisualPreset {
  backgroundUrl: string
  backgroundLabel: string
  badgeUrl?: string
  badgeLabel?: string
  badgeNote?: string
}

const backgrounds = {
  red: {
    url: recognitionAsset('background-red-crystal.png'),
    label: 'Nền đỏ quyền lực · Thống Soái + Kỳ Lân',
  },
  gold: {
    url: recognitionAsset('background-gold-crystal.png'),
    label: 'Nền vàng kim · Đại Tướng + Phượng Hoàng',
  },
  blue: {
    url: recognitionAsset('background-blue-crystal.png'),
    label: 'Nền xanh tím · Thủ Lĩnh + Sư Tử',
  },
}

const preset = (
  background: (typeof backgrounds)[keyof typeof backgrounds],
  badgeFile?: string,
  badgeLabel?: string,
  badgeNote?: string,
): RecognitionVisualPreset => ({
  backgroundUrl: background.url,
  backgroundLabel: background.label,
  badgeUrl: badgeFile ? recognitionAsset(badgeFile) : undefined,
  badgeLabel,
  badgeNote,
})

export const recognitionVisualPresets: Record<string, RecognitionVisualPreset> = {
  'manager-thong-soai': preset(backgrounds.red, 'badge-thong-soai.png', 'Thống Soái'),
  'manager-dai-tuong': preset(
    backgrounds.gold,
    'badge-tuong-quan.png',
    'Tướng Quân',
    'Tạm dùng cho bảng Đại Tướng vì chưa có file huy hiệu Đại Tướng.',
  ),
  'manager-thu-linh': preset(backgrounds.blue, 'badge-thu-linh.png', 'Thủ Lĩnh'),
  'leader-ky-lan': preset(backgrounds.red, 'badge-ky-lan.png', 'Kỳ Lân'),
  'leader-phuong-hoang': preset(backgrounds.gold, 'badge-phuong-hoang.png', 'Phượng Hoàng'),
  'leader-su-tu': preset(backgrounds.blue, 'badge-su-tu.png', 'Sư Tử'),
  'sale-fulltime': preset(backgrounds.red),
  'sale-parttime': preset(backgrounds.red),
  'team-ranking': preset(backgrounds.red),
}

export const getRecognitionVisualPreset = (boardId?: string) =>
  boardId ? recognitionVisualPresets[boardId] : undefined
