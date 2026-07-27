/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SHEET_SYNC_FUNCTION?: string
  readonly VITE_SCREEN_API_FUNCTION?: string
  readonly VITE_PUBLISH_RELEASE_FUNCTION?: string
  readonly VITE_SOURCE_SHEET_ID?: string
  readonly VITE_SHEET_SOURCE_ID?: string
  readonly VITE_DEMO_VIDEO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
