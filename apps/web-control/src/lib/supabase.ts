import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const sheetSourceId =
  import.meta.env.VITE_SOURCE_SHEET_ID?.trim() || '1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM'

export const sheetSyncFunction =
  import.meta.env.VITE_SHEET_SYNC_FUNCTION?.trim() || 'sync-sheet'

export const screenApiFunction =
  import.meta.env.VITE_SCREEN_API_FUNCTION?.trim() || 'screen-api'

export const publishReleaseFunction =
  import.meta.env.VITE_PUBLISH_RELEASE_FUNCTION?.trim() || 'publish-release'

export const sheetSourceRowId = import.meta.env.VITE_SHEET_SOURCE_ID?.trim() || undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

let client: SupabaseClient | null = null

/**
 * Returns a shared browser client only after public environment values exist.
 * UI mock mode remains fully usable without credentials.
 */
export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return client
}

export const invokeSheetSync = async (options: { force?: boolean } = {}) => {
  const supabase = getSupabase()
  if (!supabase) {
    return { data: null, error: new Error('Supabase chưa được cấu hình — đang chạy dữ liệu mô phỏng.') }
  }

  const { data: authData, error: authError } = await supabase.auth.getSession()
  if (authError || !authData.session?.access_token) {
    return { data: null, error: authError || new Error('Admin cần đăng nhập trước khi đồng bộ Sheet.') }
  }

  return supabase.functions.invoke(sheetSyncFunction, {
    headers: { Authorization: `Bearer ${authData.session.access_token}` },
    body: {
      force: options.force ?? false,
      sourceId: sheetSourceRowId,
      spreadsheetId: sheetSourceId,
    },
  })
}

const authenticatedClient = async () => {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase chưa được cấu hình — đang chạy dữ liệu mô phỏng.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw error || new Error('Admin cần đăng nhập trước.')
  return { supabase, token: data.session.access_token }
}

export type ScreenOption = {
  id: string
  screen_code: string
  name: string
  branch: { code?: string; name?: string; address?: string } | null
}

export type DeviceRegistration = {
  id: string
  device_id: string
  device_name: string | null
  device_type: string
  app_version: string | null
  pairing_code: string
  screen_id: string | null
  status: 'pending' | 'approved' | 'revoked' | 'expired'
  expires_at: string
}

export const loadPairingConsole = async () => {
  const { supabase, token } = await authenticatedClient()
  const [screensResult, registrationsResult] = await Promise.all([
    supabase.from('screens').select('id,screen_code,name,branch:branches(code,name,address)').eq('is_active', true).order('screen_code'),
    supabase.functions.invoke(screenApiFunction, {
      headers: { Authorization: `Bearer ${token}` },
      body: { action: 'registrations' },
    }),
  ])
  if (screensResult.error) throw screensResult.error
  if (registrationsResult.error) throw registrationsResult.error
  return {
    screens: (screensResult.data ?? []) as unknown as ScreenOption[],
    registrations: (registrationsResult.data?.registrations ?? []) as DeviceRegistration[],
  }
}

export const approvePairingCode = async (pairingCode: string, screenId: string) => {
  const { supabase, token } = await authenticatedClient()
  const { data, error } = await supabase.functions.invoke(screenApiFunction, {
    headers: { Authorization: `Bearer ${token}` },
    body: { action: 'approve', pairingCode: pairingCode.replace(/\s+/g, ''), screenId },
  })
  if (error) throw error
  return data
}
