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
  bottom: number
  size: number
  trail: number
  delay: number
  duration: number
  drift: number
  rise: number
  tone: 'gold' | 'ember' | 'white'
}

type SparkDepth = 'far' | 'mid' | 'near' | 'burst'

const SPARK_GROUPS: Readonly<Record<SparkDepth, readonly SparkDefinition[]>> = {
  far: [
    { left: 8, bottom: 6, size: 4, trail: 0, delay: -2.8, duration: 13.6, drift: 18, rise: 51, tone: 'gold' },
    { left: 31, bottom: 13, size: 6, trail: 0, delay: -8.1, duration: 11.9, drift: -25, rise: 58, tone: 'ember' },
    { left: 64, bottom: 3, size: 5, trail: 0, delay: -4.7, duration: 14.2, drift: 20, rise: 47, tone: 'white' },
    { left: 89, bottom: 16, size: 7, trail: 0, delay: -10.3, duration: 12.7, drift: -19, rise: 55, tone: 'gold' },
  ],
  mid: [
    { left: 16, bottom: -4, size: 8, trail: 12, delay: -1.2, duration: 9.8, drift: -28, rise: 72, tone: 'ember' },
    { left: 42, bottom: 8, size: 7, trail: 10, delay: -6.3, duration: 10.7, drift: 22, rise: 64, tone: 'gold' },
    { left: 70, bottom: -2, size: 10, trail: 15, delay: -3.8, duration: 8.9, drift: -34, rise: 78, tone: 'white' },
    { left: 93, bottom: 10, size: 8, trail: 12, delay: -7.5, duration: 9.5, drift: 26, rise: 69, tone: 'gold' },
  ],
  near: [
    { left: 23, bottom: -10, size: 14, trail: 26, delay: -3.1, duration: 7.3, drift: 38, rise: 96, tone: 'gold' },
    { left: 79, bottom: -8, size: 12, trail: 22, delay: -0.9, duration: 7.8, drift: -44, rise: 88, tone: 'ember' },
  ],
  burst: [
    { left: 18, bottom: 18, size: 16, trail: 34, delay: 0.08, duration: 2.1, drift: -58, rise: 36, tone: 'gold' },
    { left: 38, bottom: 27, size: 14, trail: 29, delay: 0.24, duration: 1.8, drift: 46, rise: 29, tone: 'white' },
    { left: 64, bottom: 22, size: 18, trail: 40, delay: 0.14, duration: 2.3, drift: -67, rise: 42, tone: 'ember' },
    { left: 83, bottom: 31, size: 16, trail: 35, delay: 0.38, duration: 1.7, drift: 55, rise: 27, tone: 'gold' },
  ],
} as const

const SparkLayer = ({ depth }: { depth: SparkDepth }) => (
  <div className={`ultra-sparks ultra-sparks--${depth}`}>
    {SPARK_GROUPS[depth].map((spark, index) => (
      <i
        className={`ultra-spark-particle ultra-spark-particle--${depth} ultra-spark-particle--${spark.tone}`}
        key={`${depth}-${index}`}
        style={{
          '--spark-left': `${spark.left}%`,
          '--spark-bottom': `${spark.bottom}%`,
          '--spark-size': `${spark.size}px`,
          '--spark-trail': `${spark.trail}px`,
          '--spark-delay': `${spark.delay}s`,
          '--spark-duration': `${spark.duration}s`,
          '--spark-drift-mid': `${Math.round(spark.drift * 0.42)}px`,
          '--spark-drift': `${spark.drift}px`,
          '--spark-rise-mid': `${Math.round(spark.rise * -0.48)}vh`,
          '--spark-rise': `${spark.rise * -1}vh`,
          '--spark-trail-tilt': `${spark.drift >= 0 ? -9 : 9}deg`,
        } as CSSProperties}
      />
    ))}
  </div>
)

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
      {shouldShowSmoke(mode) ? (
        <div className="ultra-smoke">
          <i className="ultra-smoke__layer ultra-smoke__layer--one" />
          <i className="ultra-smoke__layer ultra-smoke__layer--two" />
        </div>
      ) : null}

      {shouldShowSparks(mode) ? <SparkLayer depth="far" /> : null}

      {!hidden ? (
        <div className="ultra-watermark" style={watermarkStyle} key={`watermark-${effectKey}`}>
          <span className="ultra-watermark__glow" />
          <img src={resolvedWatermark} alt="" draggable={false} />
        </div>
      ) : null}

      {shouldShowSparks(mode) ? <SparkLayer depth="mid" /> : null}

      {shouldShowLightSweep(mode) ? (
        <span className="ultra-light-sweep" key={`sweep-${effectKey}`} />
      ) : null}

      {shouldShowSparks(mode) ? <SparkLayer depth="near" /> : null}
      {shouldShowSparks(mode) ? <SparkLayer depth="burst" key={`spark-burst-${effectKey}`} /> : null}
    </div>
  )
})
