export type HealthState = 'online' | 'warning' | 'offline'

export interface Branch {
  id: string
  code: string
  name: string
  address: string
  deviceName: string
  platform: string
  health: HealthState
  lastSeen: string
  release: string
  ready: boolean
  pilot?: boolean
}

export interface Honoree {
  rank: number
  /** Stable MNV from the accounting Sheet for QLCN/Leader photo matching. */
  entityCode?: string
  name: string
  shortName: string
  role: string
  team: string
  branch: string
  revenue: number
  accent: string
  initials: string
  photoUrl?: string
  /** Private employee-photos Storage path. Release delivery converts it to a fresh signed URL. */
  photoPath?: string
}

export interface Board {
  id: string
  group: 'manager' | 'leader' | 'fulltime' | 'parttime' | 'team'
  title: string
  subtitle: string
  threshold: string
  sourceRange: string
  honorees: Honoree[]
}

export type PlaylistKind = 'recognition' | 'video' | 'announcement' | 'event'
export type SlideTransition = 'fade' | 'slide' | 'zoom' | 'none'
export type BackgroundFit = 'cover' | 'contain'
export type BackgroundPosition = 'center' | 'top' | 'bottom'
export type LogoMode = 'default' | 'custom' | 'none'
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type LogoEffect = 'royal' | 'pulse' | 'none'

export interface ScheduleWindow {
  enabled: boolean
  startDate: string
  endDate: string
  dailyStart: string
  dailyEnd: string
  weekdays: number[]
}

export interface PlaylistItem {
  id: string
  boardId?: string
  title: string
  kind: PlaylistKind
  meta: string
  duration: number
  enabled: boolean
  audience: string
}

export interface PlaylistDraftItem extends PlaylistItem {
  /**
   * Immutable recognition data decoded from a published release manifest.
   * The TV player rejects recognition slides when this dataset is absent.
   */
  recognitionBoard?: Board
  headline: string
  subtitle: string
  body: string
  transition: SlideTransition
  transitionDuration: number
  backgroundAssetId?: string
  backgroundAssetName?: string
  backgroundUrl?: string
  backgroundFit: BackgroundFit
  backgroundPosition: BackgroundPosition
  overlayOpacity: number
  logoMode: LogoMode
  logoAssetId?: string
  logoAssetName?: string
  logoUrl?: string
  logoPosition: LogoPosition
  logoScale: number
  logoEffect: LogoEffect
  mediaAssetId?: string
  mediaAssetName?: string
  mediaUrl: string
  audioEnabled: boolean
  branchIds: string[]
  schedule?: ScheduleWindow
  eventDate: string
  eventTime: string
  location: string
  showHeader: boolean
  showFooter: boolean
}

export interface PlaylistConfig {
  version: 1
  name: string
  items: PlaylistDraftItem[]
  schedule: ScheduleWindow
  repeat: boolean
  updatedAt: string
}

export interface ImportRun {
  id: string
  createdAt: string
  period: string
  state: 'final' | 'warning' | 'draft' | 'demo'
  records: number
  warnings: number
  sourceVersion: string
  actor: string
}

export interface Release {
  id: string
  version: string
  state: 'live' | 'scheduled' | 'archived'
  label: string
  changed: string
  ready: string
  publishedAt: string
  actor: string
}
