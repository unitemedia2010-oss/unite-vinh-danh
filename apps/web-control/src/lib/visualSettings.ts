import { useEffect, useState } from 'react'

export interface VisualSettings {
  watermarkOpacity: number
  watermarkOffsetY: number
  watermarkSize: number
  boardBadges: Record<string, string>
}

const defaultSettings: VisualSettings = {
  watermarkOpacity: 8,
  watermarkOffsetY: -44,
  watermarkSize: 92,
  boardBadges: {},
}

const SETTINGS_POLL_MS = 60_000
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback
}

export const normalizeVisualSettings = (value: unknown): VisualSettings => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const badges = record.boardBadges && typeof record.boardBadges === 'object' && !Array.isArray(record.boardBadges)
    ? Object.fromEntries(Object.entries(record.boardBadges as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
  return {
    watermarkOpacity: clamp(record.watermarkOpacity, defaultSettings.watermarkOpacity, 0, 12),
    watermarkOffsetY: clamp(record.watermarkOffsetY, defaultSettings.watermarkOffsetY, -65, -25),
    watermarkSize: clamp(record.watermarkSize, defaultSettings.watermarkSize, 55, 112),
    boardBadges: badges,
  }
}

let cachedSettings: VisualSettings | null = null
let loadWarningShown = false
const listeners = new Set<(settings: VisualSettings) => void>()

function notifyListeners(settings: VisualSettings) {
  cachedSettings = settings
  listeners.forEach((l) => l(settings))
}

const loadPublicSettings = async (signal?: AbortSignal) => {
  if (!supabaseUrl || !supabaseAnonKey) return
  const response = await fetch(`${supabaseUrl}/rest/v1/app_visual_settings?id=eq.1&select=settings`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: 'application/json',
    },
    signal,
  })
  if (!response.ok) throw new Error(`Visual settings HTTP ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload) || !payload.length) return
  const first = payload[0]
  if (first && typeof first === 'object' && 'settings' in first) {
    notifyListeners(normalizeVisualSettings(first.settings))
    loadWarningShown = false
  }
}

export function useVisualSettings() {
  const [settings, setSettings] = useState<VisualSettings>(cachedSettings || defaultSettings)

  useEffect(() => {
    listeners.add(setSettings)
    let controller = new AbortController()
    const refresh = () => {
      controller.abort()
      controller = new AbortController()
      void loadPublicSettings(controller.signal).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError') && !loadWarningShown) {
          loadWarningShown = true
          console.warn('Failed to load visual settings; using safe defaults.', error)
        }
      })
    }
    refresh()
    const timer = window.setInterval(refresh, SETTINGS_POLL_MS)

    return () => {
      controller.abort()
      window.clearInterval(timer)
      listeners.delete(setSettings)
    }
  }, [])

  return settings
}

export const applyVisualSettings = (settings: VisualSettings) => {
  const normalized = normalizeVisualSettings(settings)
  notifyListeners(normalized)
  return normalized
}
