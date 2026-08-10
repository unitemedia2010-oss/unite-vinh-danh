import { memo, type CSSProperties } from 'react'
import { getRecognitionVisualPreset } from '../data/recognitionPresets'
import type { LogoMode } from '../types'
import {
  shouldShowLightSweep,
  shouldShowSmoke,
  shouldShowSparks,
  shouldShowWatermark,
  type VisualMode,
} from './visualMode'

interface UltraVisualSettings {
  watermarkOpacity?: number
  watermarkOffsetY?: number
  watermarkSize?: number
  boardBadges?: Record<string, string>
}

interface UltraEffectsProps {
  mode: VisualMode
  boardId?: string
  logoMode?: LogoMode | 'hidden'
  watermarkUrl?: string
  visualSettings?: UltraVisualSettings
}

interface SparkDefinition {
  left: number
  size: number
  delay: number
  duration: number
  drift: number
}

const SPARKS: readonly SparkDefinition[] = [
  { left: 7, size: 2, delay: -1.2, duration: 5.8, drift: -12 },
  { left: 16, size: 3, delay: -4.1, duration: 7.2, drift: 18 },
  { left: 27, size: 2, delay: -2.7, duration: 6.4, drift: -22 },
  { left: 38, size: 4, delay: -5.3, duration: 8.1, drift: 14 },
  { left: 49, size: 2, delay: -0.8, duration: 5.5, drift: -8 },
  { left: 61, size: 3, delay: -3.6, duration: 7.6, drift: 24 },
  { left: 72, size: 2, delay: -6.2, duration: 8.4, drift: -16 },
  { left: 82, size: 4, delay: -2.1, duration: 6.9, drift: 11 },
  { left: 91, size: 2, delay: -4.8, duration: 7.9, drift: -20 },
] as const

const clamp = (value: number | undefined, minimum: number, maximum: number, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, value))
}

const brandAsset = (fileName: string) => {
  const path = `${import.meta.env.BASE_URL}brand/${fileName}`
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href
}

const UNITE_WATERMARK_URL = brandAsset('unite-mark-gold-v2.png')

export const UltraEffects = memo(function UltraEffects({
  mode,
  boardId,
  logoMode,
  watermarkUrl,
  visualSettings,
}: UltraEffectsProps) {
  if (!shouldShowWatermark(mode)) return null

  const hidden = logoMode === 'none' || logoMode === 'hidden'
  const preset = getRecognitionVisualPreset(boardId)
  const configuredBadge = boardId ? visualSettings?.boardBadges?.[boardId]?.trim() : ''
  const resolvedWatermark = watermarkUrl?.trim()
    || configuredBadge
    || preset?.badgeUrl
    || UNITE_WATERMARK_URL
  const effectKey = boardId || resolvedWatermark

  const watermarkStyle = {
    '--ultra-watermark-opacity': String(clamp(visualSettings?.watermarkOpacity, 0, 12, 8) / 100),
    '--ultra-watermark-size': `${clamp(visualSettings?.watermarkSize, 55, 112, 96)}vh`,
    '--ultra-watermark-offset-y': `${clamp(visualSettings?.watermarkOffsetY, -65, -25, -38)}%`,
  } as CSSProperties

  return (
    <div className={`ultra-effects-layer ultra-effects-layer--${mode}`} aria-hidden="true">
      {!hidden ? (
        <div className="ultra-watermark" style={watermarkStyle} key={`watermark-${effectKey}`}>
          <span className="ultra-watermark__glow" />
          <img src={resolvedWatermark} alt="" draggable={false} />
        </div>
      ) : null}

      {shouldShowSmoke(mode) ? (
        <div className="ultra-smoke">
          <i className="ultra-smoke__layer ultra-smoke__layer--one" />
          <i className="ultra-smoke__layer ultra-smoke__layer--two" />
        </div>
      ) : null}

      {shouldShowSparks(mode) ? (
        <div className="ultra-sparks">
          {SPARKS.map((spark, index) => (
            <i
              className="ultra-spark-particle"
              key={index}
              style={{
                '--spark-left': `${spark.left}%`,
                '--spark-size': `${spark.size}px`,
                '--spark-delay': `${spark.delay}s`,
                '--spark-duration': `${spark.duration}s`,
                '--spark-drift': `${spark.drift}px`,
              } as CSSProperties}
            />
          ))}
        </div>
      ) : null}

      {shouldShowLightSweep(mode) ? (
        <span className="ultra-light-sweep" key={`sweep-${effectKey}`} />
      ) : null}
    </div>
  )
})
