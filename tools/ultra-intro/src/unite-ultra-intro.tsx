import { Audio } from '@remotion/media'
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const sparkLayout = [
  [8, 78, 0.72], [15, 88, 0.48], [24, 68, 0.62], [33, 92, 0.86],
  [43, 73, 0.55], [52, 85, 0.78], [61, 66, 0.44], [70, 91, 0.67],
  [79, 74, 0.83], [87, 86, 0.52], [93, 64, 0.74], [97, 93, 0.46],
] as const

const shardLayout = [
  ['4%', '10%', -24, 0.58], ['13%', '73%', 18, 0.46], ['28%', '7%', 37, 0.35],
  ['71%', '9%', -36, 0.38], ['82%', '68%', 22, 0.52], ['93%', '20%', -18, 0.6],
] as const

export const UniteUltraIntro = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const reveal = spring({ frame, fps, config: { damping: 180, mass: 1.2 }, durationInFrames: 46 })
  const impact = interpolate(frame, [37, 46, 64, 86], [0, 1, 0.62, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })
  const outro = interpolate(frame, [74, 86], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const sweepX = interpolate(frame, [20, 64], [-720, 720], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#030405', overflow: 'hidden', opacity: outro }}>
      <AbsoluteFill style={{
        background:
          'radial-gradient(circle at 50% 52%, rgba(151,92,8,.34), transparent 34%), radial-gradient(circle at 50% 50%, #15100a 0%, #070707 46%, #020304 100%)',
      }} />

      <AbsoluteFill style={{
        opacity: interpolate(frame, [0, 28, 86], [0.15, 0.52, 0.18], { extrapolateRight: 'clamp' }),
        scale: interpolate(frame, [0, 86], [1.08, 1.28], { extrapolateRight: 'clamp' }),
        translate: `${interpolate(frame, [0, 86], [-90, 75], { extrapolateRight: 'clamp' })}px 0px`,
        background: 'radial-gradient(ellipse at 32% 64%, rgba(184,126,34,.28), transparent 31%), radial-gradient(ellipse at 70% 36%, rgba(106,73,21,.26), transparent 34%)',
        filter: 'blur(34px)',
      }} />

      {shardLayout.map(([left, top, rotate, opacity], index) => (
        <div key={left} style={{
          position: 'absolute', left, top, width: 260 + index * 28, height: 3,
          rotate: `${rotate}deg`, opacity: impact * opacity,
          background: 'linear-gradient(90deg, transparent, #f6cc64, rgba(255,255,255,.94), transparent)',
          boxShadow: '0 0 22px rgba(238,183,50,.6)',
          scale: interpolate(frame, [24 + index * 2, 58 + index], [0.2, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }} />
      ))}

      {sparkLayout.map(([left, bottom, intensity], index) => {
        const localFrame = Math.max(0, frame - (index % 4) * 4)
        return (
          <i key={`${left}-${bottom}`} style={{
            position: 'absolute', left: `${left}%`, bottom: `${bottom - interpolate(localFrame, [0, 86], [0, 68], { extrapolateRight: 'clamp' })}%`,
            width: 3 + (index % 3), height: 3 + (index % 3), borderRadius: '50%',
            opacity: interpolate(localFrame, [0, 16, 72, 86], [0, intensity, intensity * 0.45, 0], { extrapolateRight: 'clamp' }),
            backgroundColor: index % 3 === 0 ? '#fff3bd' : '#eab32d',
            boxShadow: '0 0 13px #eab32d',
          }} />
        )
      })}

      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 610, height: 610,
        translate: '-50% -50%', rotate: `${interpolate(frame, [0, 86], [-38, 48], { extrapolateRight: 'clamp' })}deg`,
        scale: 0.72 + reveal * 0.28, opacity: impact * 0.74,
        borderRadius: '50%', padding: 2,
        background: 'conic-gradient(from 20deg, transparent 0 18%, #e4ae28 24%, #fff4bd 28%, transparent 34% 72%, #c7860d 80%, transparent 88%)',
        boxShadow: '0 0 80px rgba(210,148,24,.34)',
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#070707' }} />
      </div>

      <Img
        src={staticFile('unite-mark.png')}
        style={{
          position: 'absolute', left: '50%', top: '50%', width: 470, height: 470,
          objectFit: 'contain', translate: '-50% -50%',
          scale: 0.62 + reveal * 0.38,
          opacity: interpolate(frame, [5, 26, 76, 86], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          filter: `drop-shadow(0 0 ${18 + impact * 35}px rgba(238,185,48,.72))`,
        }}
      />

      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 150, height: 760,
        translate: `${sweepX - 75}px -50%`, rotate: '24deg', opacity: impact * 0.7,
        background: 'linear-gradient(90deg, transparent, rgba(255,245,194,.78), transparent)',
        filter: 'blur(9px)', mixBlendMode: 'screen',
      }} />

      <Audio src={staticFile('cinematic-impact.wav')} volume={0.72} />
    </AbsoluteFill>
  )
}
