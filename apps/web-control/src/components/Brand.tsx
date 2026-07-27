interface BrandProps {
  compact?: boolean
  inverse?: boolean
}

export function Brand({ compact = false, inverse = false }: BrandProps) {
  const assetBase = import.meta.env.BASE_URL
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''} ${inverse ? 'brand--inverse' : ''}`}>
      <img
        className={compact ? 'brand__mark-image' : 'brand__wordmark'}
        src={compact ? `${assetBase}brand/unite-group-mark-black.png` : `${assetBase}brand/unite-group-logo.png`}
        alt={compact ? 'Unite Group' : 'Unite Group — Nâng tầm cuộc sống'}
      />
    </div>
  )
}
