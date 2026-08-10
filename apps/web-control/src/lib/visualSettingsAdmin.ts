import { getSupabase } from './supabase'
import {
  applyVisualSettings,
  normalizeVisualSettings,
  type VisualSettings,
} from './visualSettings'

export async function saveVisualSettings(settings: VisualSettings) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')

  const normalized = normalizeVisualSettings(settings)
  const { error } = await supabase.rpc('set_app_visual_settings', {
    p_settings: normalized,
  })
  if (error) throw error

  applyVisualSettings(normalized)
  return normalized
}
