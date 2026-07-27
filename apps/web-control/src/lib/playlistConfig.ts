import { useCallback, useEffect, useState } from 'react'
import { boards, playlist as initialPlaylist } from '../data/mock'
import type {
  PlaylistConfig,
  PlaylistDraftItem,
  PlaylistItem,
  PlaylistKind,
  ScheduleWindow,
} from '../types'

const STORAGE_KEY = 'unite-recognition-playlist-v1'
const CHANNEL_NAME = 'unite-recognition-playlist'

const allWeekdays = [1, 2, 3, 4, 5, 6, 0]

export const DEFAULT_DEMO_VIDEO_URL = 'https://media.w3.org/2010/05/video/movie_300.mp4'

export const defaultSchedule = (): ScheduleWindow => ({
  enabled: false,
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  dailyStart: '06:30',
  dailyEnd: '22:00',
  weekdays: [...allWeekdays],
})

const contentDefaults: Record<string, Partial<PlaylistDraftItem>> = {
  'pl-10': {
    headline: 'UNITE WEEKLY',
    subtitle: 'Bản tin nội bộ · Số 32',
    body: 'Thông tin nổi bật trong tuần',
    mediaUrl: DEFAULT_DEMO_VIDEO_URL,
    audioEnabled: true,
  },
  'pl-11': {
    headline: 'KICK-OFF THÁNG 08',
    subtitle: 'Bứt phá giới hạn · Chinh phục mục tiêu mới',
    body: 'Sự kiện khởi động tháng mới',
    eventDate: '2026-08-08',
    eventTime: '08:00',
    location: 'Hội trường chính · 125 Trần Bình Trọng',
  },
  'pl-12': {
    headline: 'CÙNG NHAU HOÀN THÀNH',
    subtitle: 'Việc cần làm hôm nay',
    body: 'Cập nhật trạng thái khách hàng trên CRM\nXác nhận lịch hẹn ngày mai trước 17:30\nKiểm tra thông tin bàn giao cuối ngày',
  },
}

export const normalizePlaylistItem = (item: PlaylistItem): PlaylistDraftItem => {
  const board = item.boardId ? boards.find((candidate) => candidate.id === item.boardId) : undefined
  const special = contentDefaults[item.id] ?? {}
  return {
    ...item,
    headline: special.headline ?? board?.title ?? item.title,
    subtitle: special.subtitle ?? board?.subtitle ?? item.meta,
    body: special.body ?? '',
    transition: 'fade',
    transitionDuration: 0.65,
    backgroundFit: 'cover',
    backgroundPosition: 'center',
    overlayOpacity: item.kind === 'recognition' ? 24 : 50,
    logoMode: 'default',
    logoPosition: item.kind === 'recognition' ? 'top-left' : 'top-right',
    logoScale: 100,
    logoEffect: item.kind === 'recognition' ? 'royal' : 'none',
    mediaUrl: special.mediaUrl ?? '',
    audioEnabled: special.audioEnabled ?? item.kind === 'video',
    branchIds: [],
    eventDate: special.eventDate ?? '2026-08-08',
    eventTime: special.eventTime ?? '08:00',
    location: special.location ?? '125 Trần Bình Trọng',
    showHeader: true,
    showFooter: true,
  }
}

export const createDefaultPlaylistConfig = (): PlaylistConfig => ({
  version: 1,
  name: 'Chu kỳ vinh danh toàn hệ thống',
  items: initialPlaylist.map(normalizePlaylistItem),
  schedule: defaultSchedule(),
  repeat: true,
  updatedAt: new Date().toISOString(),
})

const isDraftItem = (value: unknown): value is PlaylistDraftItem => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PlaylistDraftItem>
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.kind === 'string'
    && typeof candidate.duration === 'number'
}

const hydrateItem = (item: PlaylistDraftItem): PlaylistDraftItem => {
  const base = normalizePlaylistItem(item)
  const isLegacyRecognition = item.kind === 'recognition' && typeof item.logoEffect !== 'string'
  return {
    ...base,
    ...item,
    overlayOpacity: isLegacyRecognition && !item.backgroundAssetId ? 24 : item.overlayOpacity ?? base.overlayOpacity,
    logoPosition: isLegacyRecognition ? 'top-left' : item.logoPosition ?? base.logoPosition,
    logoEffect: item.logoEffect ?? base.logoEffect,
    branchIds: Array.isArray(item.branchIds) ? item.branchIds : [],
    schedule: item.schedule
      ? {
          ...defaultSchedule(),
          ...item.schedule,
          weekdays: Array.isArray(item.schedule.weekdays) ? item.schedule.weekdays : [...allWeekdays],
        }
      : undefined,
  }
}

const hydrateConfig = (value: unknown): PlaylistConfig | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<PlaylistConfig>
  if (candidate.version !== 1 || !Array.isArray(candidate.items) || !candidate.items.every(isDraftItem)) return null
  const fallback = createDefaultPlaylistConfig()
  return {
    ...fallback,
    ...candidate,
    version: 1,
    items: candidate.items.map(hydrateItem),
    schedule: {
      ...fallback.schedule,
      ...candidate.schedule,
      weekdays: Array.isArray(candidate.schedule?.weekdays) ? candidate.schedule.weekdays : fallback.schedule.weekdays,
    },
  }
}

export const loadPlaylistConfig = (): PlaylistConfig => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved ? hydrateConfig(JSON.parse(saved)) ?? createDefaultPlaylistConfig() : createDefaultPlaylistConfig()
  } catch {
    return createDefaultPlaylistConfig()
  }
}

export const savePlaylistConfig = (config: PlaylistConfig) => {
  const next = { ...config, updatedAt: new Date().toISOString() }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage(next)
    channel.close()
  }
  return next
}

export const clearPlaylistConfig = () => {
  window.localStorage.removeItem(STORAGE_KEY)
  return savePlaylistConfig(createDefaultPlaylistConfig())
}

const subscribePlaylistConfig = (listener: (config: PlaylistConfig) => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const config = hydrateConfig(JSON.parse(event.newValue))
      if (config) listener(config)
    } catch {
      // Ignore malformed storage values and retain the last valid draft.
    }
  }
  window.addEventListener('storage', onStorage)

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null
  const onMessage = (event: MessageEvent<unknown>) => {
    const config = hydrateConfig(event.data)
    if (config) listener(config)
  }
  channel?.addEventListener('message', onMessage)

  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onMessage)
    channel?.close()
  }
}

export const usePlaylistConfig = () => {
  const [config, setConfigState] = useState<PlaylistConfig>(loadPlaylistConfig)

  useEffect(() => subscribePlaylistConfig(setConfigState), [])

  const setConfig = useCallback((updater: PlaylistConfig | ((current: PlaylistConfig) => PlaylistConfig)) => {
    setConfigState((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater
      return savePlaylistConfig(next)
    })
  }, [])

  const resetConfig = useCallback(() => {
    const reset = clearPlaylistConfig()
    setConfigState(reset)
    return reset
  }, [])

  return { config, setConfig, resetConfig }
}

export const createPlaylistItem = (kind: PlaylistKind): PlaylistDraftItem => {
  const id = `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
  const firstBoard = boards[0]
  const base: PlaylistItem = {
    id,
    boardId: kind === 'recognition' ? firstBoard.id : undefined,
    title: kind === 'recognition' ? `Bảng · ${firstBoard.title}` : kind === 'video' ? 'Video mới' : kind === 'event' ? 'Sự kiện mới' : 'Thông báo mới',
    kind,
    meta: kind === 'recognition' ? firstBoard.threshold : 'Nội dung do Admin tạo',
    duration: kind === 'video' ? 30 : 15,
    enabled: true,
    audience: 'Toàn hệ thống',
  }
  const normalized = normalizePlaylistItem(base)
  return {
    ...normalized,
    headline: kind === 'recognition' ? firstBoard.title : normalized.title.toUpperCase(),
    subtitle: kind === 'recognition' ? firstBoard.subtitle : 'Nhập phụ đề hiển thị trên TV',
  }
}

const dateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const minutesOfDay = (value: string) => {
  const [hours = '0', minutes = '0'] = value.split(':')
  return Number(hours) * 60 + Number(minutes)
}

export const isWithinSchedule = (schedule: ScheduleWindow, now: Date) => {
  if (!schedule.enabled) return true
  const today = dateKey(now)
  if (schedule.startDate && today < schedule.startDate) return false
  if (schedule.endDate && today > schedule.endDate) return false
  if (schedule.weekdays.length && !schedule.weekdays.includes(now.getDay())) return false

  const current = now.getHours() * 60 + now.getMinutes()
  const start = minutesOfDay(schedule.dailyStart)
  const end = minutesOfDay(schedule.dailyEnd)
  if (start === end) return true
  return start < end ? current >= start && current <= end : current >= start || current <= end
}
