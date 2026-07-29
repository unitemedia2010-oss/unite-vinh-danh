import {
  isPlayerItemAllowed,
  prioritizePlayerSlides,
  shouldApplyAudienceAndSchedule,
  toPublishedPlayerSlide,
} from '../src/screen/playerPolicy.ts'
import type { Board, PlaylistDraftItem } from '../src/types.ts'

type PlayerSlide = PlaylistDraftItem & { board?: Board }

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const board: Board = {
  id: 'manager-thong-soai',
  group: 'manager',
  title: 'Thống Soái',
  subtitle: 'Quản lý chi nhánh xuất sắc',
  threshold: 'Từ 500 triệu trở lên',
  sourceRange: 'Published release manifest',
  honorees: [],
}

const item = (overrides: Partial<PlaylistDraftItem>): PlaylistDraftItem => ({
  id: 'slide',
  title: 'Slide',
  kind: 'announcement',
  meta: '',
  duration: 10,
  enabled: true,
  audience: 'Toàn hệ thống',
  headline: 'Nội dung',
  subtitle: '',
  body: '',
  transition: 'fade',
  transitionDuration: 0.6,
  backgroundFit: 'cover',
  backgroundPosition: 'center',
  overlayOpacity: 50,
  logoMode: 'default',
  logoPosition: 'top-left',
  logoScale: 100,
  logoEffect: 'none',
  mediaUrl: '',
  audioEnabled: false,
  branchIds: [],
  eventDate: '',
  eventTime: '',
  location: '',
  showHeader: true,
  showFooter: true,
  ...overrides,
})

Deno.test('recognition never falls back to local sample data', () => {
  const missingDataset = item({ kind: 'recognition', boardId: board.id })
  assert(toPublishedPlayerSlide(missingDataset) === null, 'missing published board must be rejected')

  const published = toPublishedPlayerSlide(item({
    kind: 'recognition',
    boardId: board.id,
    headline: 'THỐNG SOÁI',
    recognitionBoard: board,
  }))
  assert(published?.board?.title === 'THỐNG SOÁI', 'published board should be playable')
})

Deno.test('public TV bypasses branch and schedule gates', () => {
  assert(!shouldApplyAudienceAndSchedule('public'), 'public TV must be always-on and global')
  assert(shouldApplyAudienceAndSchedule('paired'), 'paired TV keeps Admin targeting and schedules')
  assert(isPlayerItemAllowed('public', 'recognition'), 'public TV should accept recognition')
  assert(!isPlayerItemAllowed('public', 'video'), 'public TV should reject non-recognition media')
  assert(isPlayerItemAllowed('paired', 'video'), 'paired TV keeps the full Admin playlist')
})

Deno.test('public TV starts with recognition while explicit deep links win', () => {
  const announcement = item({ id: 'announcement', kind: 'announcement' }) as PlayerSlide
  const recognition = {
    ...item({ id: 'recognition', kind: 'recognition', boardId: board.id, recognitionBoard: board }),
    board,
  } as PlayerSlide

  const automatic = prioritizePlayerSlides([announcement, recognition], null, null, 'public')
  assert(automatic[0].id === 'recognition', 'recognition should be first on public TV')

  const explicit = prioritizePlayerSlides([announcement, recognition], 'announcement', null, 'public')
  assert(explicit[0].id === 'announcement', 'explicit item deep link should stay first')
})
