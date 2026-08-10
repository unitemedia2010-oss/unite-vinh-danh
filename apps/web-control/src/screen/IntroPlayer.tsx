import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { isUltra, shouldRetryIntroMuted, type VisualMode } from './visualMode'

export const INTRO_MIN_DURATION_MS = 2_800
export const INTRO_MAX_DURATION_MS = 3_000

const REDUCED_MOTION_DURATION_MS = 300

const brandAsset = (fileName: string) => {
  const path = `${import.meta.env.BASE_URL}brand/${fileName}`
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href
}

const INTRO_VIDEO_URL = brandAsset('intro-ultra-v1.mp4')
const INTRO_POSTER_URL = brandAsset('intro-ultra-v1-poster.webp')

const reducedMotionPreferred = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
)

interface IntroPlayerProps {
  mode: VisualMode
  periodLabel?: string
  muted: boolean
  onMutedChange: (muted: boolean) => void
  onAudioBlockedChange?: (blocked: boolean) => void
  onFinished: () => void
}

export function IntroPlayer({
  mode,
  periodLabel,
  muted,
  onMutedChange,
  onAudioBlockedChange,
  onFinished,
}: IntroPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onFinishedRef = useRef(onFinished)
  const onMutedChangeRef = useRef(onMutedChange)
  const onAudioBlockedChangeRef = useRef(onAudioBlockedChange)
  const initialMutedRef = useRef(muted)
  const finishedRef = useRef(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const [reducedMotion] = useState(reducedMotionPreferred)

  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  useEffect(() => {
    onMutedChangeRef.current = onMutedChange
  }, [onMutedChange])

  useEffect(() => {
    onAudioBlockedChangeRef.current = onAudioBlockedChange
  }, [onAudioBlockedChange])

  useEffect(() => {
    if (!isUltra(mode) || reducedMotion) {
      const timer = window.setTimeout(() => onFinishedRef.current(), REDUCED_MOTION_DURATION_MS)
      return () => window.clearTimeout(timer)
    }

    const video = videoRef.current
    const startedAt = performance.now()
    let disposed = false
    let minimumTimer: number | undefined

    finishedRef.current = false
    setVideoPlaying(false)
    setVideoUnavailable(false)

    const finishOnce = () => {
      if (disposed || finishedRef.current) return
      finishedRef.current = true
      onFinishedRef.current()
    }

    const finishAfterMinimum = () => {
      const remaining = Math.max(0, INTRO_MIN_DURATION_MS - (performance.now() - startedAt))
      if (minimumTimer) window.clearTimeout(minimumTimer)
      minimumTimer = window.setTimeout(finishOnce, remaining)
    }

    const maximumTimer = window.setTimeout(finishOnce, INTRO_MAX_DURATION_MS)
    if (!video) {
      setVideoUnavailable(true)
      return () => {
        disposed = true
        window.clearTimeout(maximumTimer)
      }
    }

    const handleEnded = () => finishAfterMinimum()
    const handleMediaError = () => {
      if (!disposed) setVideoUnavailable(true)
    }

    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleMediaError)

    const playIntro = async () => {
      const startsMuted = initialMutedRef.current
      video.muted = startsMuted
      try {
        await video.play()
        if (!disposed) {
          setVideoPlaying(true)
          if (!startsMuted) onAudioBlockedChangeRef.current?.(false)
        }
        return
      } catch (error) {
        if (disposed) return
        if (!shouldRetryIntroMuted(startsMuted, error)) {
          setVideoUnavailable(true)
          return
        }
        onAudioBlockedChangeRef.current?.(true)
      }

      onMutedChangeRef.current(true)
      video.muted = true
      try {
        await video.play()
        if (!disposed) setVideoPlaying(true)
      } catch {
        if (!disposed) setVideoUnavailable(true)
      }
    }

    void playIntro()
    return () => {
      disposed = true
      video.pause()
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleMediaError)
      window.clearTimeout(maximumTimer)
      if (minimumTimer) window.clearTimeout(minimumTimer)
    }
  }, [mode, reducedMotion])

  const posterStyle = {
    '--intro-poster': `url("${INTRO_POSTER_URL}")`,
  } as CSSProperties

  return (
    <div
      className={`ultra-intro ${reducedMotion ? 'ultra-intro--reduced' : ''}`}
      style={posterStyle}
      aria-hidden="true"
    >
      {isUltra(mode) && !reducedMotion && !videoUnavailable ? (
        <video
          ref={videoRef}
          className={`ultra-intro__video ${videoPlaying ? 'is-playing' : ''}`}
          src={INTRO_VIDEO_URL}
          poster={INTRO_POSTER_URL}
          muted={muted}
          playsInline
          preload="auto"
        />
      ) : null}
      <div className="ultra-intro__shade" />
      <div className="ultra-intro__overlay">
        <p>UNITE GROUP</p>
        <h1>BẢNG VÀNG VINH DANH</h1>
        {periodLabel ? <h2>{periodLabel}</h2> : null}
        <span />
      </div>
    </div>
  )
}
