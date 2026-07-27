import { useEffect, useState } from 'react'
import type { Honoree } from '../types'

export function Avatar({ person, size = 'md', glow = false }: { person: Honoree; size?: 'sm' | 'md' | 'lg' | 'xl'; glow?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false)

  useEffect(() => setPhotoFailed(false), [person.photoUrl])

  return (
    <div
      className={`avatar avatar--${size} ${glow ? 'avatar--glow' : ''}`}
      style={{ '--avatar-accent': person.accent } as React.CSSProperties}
      aria-label={`Ảnh đại diện ${person.name}`}
    >
      {person.photoUrl && !photoFailed
        ? <img src={person.photoUrl} alt="" loading="eager" onError={() => setPhotoFailed(true)} />
        : <span>{person.initials}</span>}
    </div>
  )
}
