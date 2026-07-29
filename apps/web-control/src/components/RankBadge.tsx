export function RankBadge({ rank }: { rank: number }) {
  const normalizedRank = Math.max(1, Math.round(rank))
  const tone = normalizedRank <= 3 ? normalizedRank : 'other'

  return (
    <span
      className={`rank-badge rank-badge--${tone}`}
      role="img"
      aria-label={`Hạng ${normalizedRank}`}
    >
      <small>HẠNG</small>
      <b>{normalizedRank}</b>
    </span>
  )
}
