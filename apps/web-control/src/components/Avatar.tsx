import { useEffect, useState } from 'react'
import type { Honoree } from '../types'

export function Avatar({
  person,
  size = 'md',
  glow = false,
  presentation = 'round',
}: {
  person: Honoree
  size?: 'sm' | 'md' | 'lg' | 'xl'
  glow?: boolean
  presentation?: 'round' | 'cutout'
}) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const hasPhoto = Boolean(person.photoUrl && !photoFailed)

  useEffect(() => setPhotoFailed(false), [person.photoUrl])

  return (
    <div
      className={`avatar avatar--${size} ${hasPhoto ? 'avatar--has-photo' : ''} ${hasPhoto && presentation === 'cutout' ? 'avatar--cutout' : ''} ${glow ? 'avatar--glow' : ''}`}
      style={{ '--avatar-accent': person.accent } as React.CSSProperties}
      aria-label={`Ảnh đại diện ${person.name}`}
    >
      {hasPhoto
        ? (
          <span className="avatar__photo">
            <img src={person.photoUrl} alt="" loading="eager" onError={() => setPhotoFailed(true)} />
          </span>
        )
        : <span className="avatar__initials">{person.initials}</span>}
    </div>
  )
}
