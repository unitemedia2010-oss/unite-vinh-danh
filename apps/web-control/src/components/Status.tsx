import { CircleCheckBig, Clock3, TriangleAlert, WifiOff } from 'lucide-react'

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'gold' | 'info'

export function StatusPill({ tone = 'neutral', children, dot = true }: { tone?: StatusTone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      {dot && <i />}
      {children}
    </span>
  )
}

export function HealthIcon({ state }: { state: 'online' | 'warning' | 'offline' }) {
  if (state === 'online') return <CircleCheckBig size={17} />
  if (state === 'warning') return <TriangleAlert size={17} />
  return <WifiOff size={17} />
}

export function ReleaseIcon({ state }: { state: 'live' | 'scheduled' | 'archived' }) {
  if (state === 'live') return <CircleCheckBig size={16} />
  if (state === 'scheduled') return <Clock3 size={16} />
  return <Clock3 size={16} />
}
