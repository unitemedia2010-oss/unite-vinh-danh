import type { VisualMode } from '../types'
import type { PlayerMode } from './playerPolicy'

export type { VisualMode } from '../types'

export type VisualSurface = PlayerMode | 'share'

export interface ScreenPresentationMetadata {
  visualMode?: VisualMode | string | null
}

const VISUAL_MODES = new Set<VisualMode>(['lite', 'standard', 'ultra'])

export const parseVisualMode = (value: unknown): VisualMode | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase() as VisualMode
  return VISUAL_MODES.has(normalized) ? normalized : null
}

/**
 * Keeps the legacy query switches for paired-screen support/debug links.
 */
export const visualModeOverride = (params: URLSearchParams): VisualMode | null => {
  const explicitMode = parseVisualMode(params.get('mode'))
  if (explicitMode) return explicitMode

  const legacyLite = params.get('lite')?.trim().toLowerCase()
  if (legacyLite === '1' || legacyLite === 'true' || legacyLite === 'lite') return 'lite'
  if (legacyLite === '0' || legacyLite === 'false' || legacyLite === 'full') return 'ultra'
  return null
}

export const resolveVisualMode = (
  params: URLSearchParams,
  surface: VisualSurface,
  screenPresentation?: ScreenPresentationMetadata | null,
): VisualMode => {
  if (surface === 'public' || surface === 'share') return 'ultra'
  const override = visualModeOverride(params)
  if (override) return override
  return parseVisualMode(screenPresentation?.visualMode) ?? 'ultra'
}

export const isUltra = (mode: VisualMode) => mode === 'ultra'
export const isStandard = (mode: VisualMode) => mode === 'standard'
export const isLite = (mode: VisualMode) => mode === 'lite'

export const shouldPlayIntro = (mode: VisualMode) => mode === 'ultra'
export const canStartIntro = (
  mode: VisualMode,
  connectionReady: boolean,
  hasPlaylist: boolean,
  releaseId: string | null | undefined,
) => shouldPlayIntro(mode) && connectionReady && hasPlaylist && Boolean(releaseId)

export const shouldReplayIntroOnAutomaticWrap = (
  mode: VisualMode,
  currentIndex: number,
  slideCount: number,
  repeat: boolean,
) => (
  shouldPlayIntro(mode)
  && repeat
  && slideCount > 0
  && currentIndex >= slideCount - 1
)

export const isAutoplayBlockedError = (error: unknown) => (
  typeof error === 'object'
  && error !== null
  && 'name' in error
  && error.name === 'NotAllowedError'
)
export const shouldRetryIntroMuted = (startedMuted: boolean, error: unknown) => (
  !startedMuted && isAutoplayBlockedError(error)
)
export const shouldShowWatermark = (mode: VisualMode) => mode !== 'lite'
export const shouldShowLightSweep = (mode: VisualMode) => mode !== 'lite'
export const shouldShowSmoke = (mode: VisualMode) => mode === 'ultra'
export const shouldShowSparks = (mode: VisualMode) => mode === 'ultra'
