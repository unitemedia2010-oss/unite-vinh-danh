export type PlayerMode = 'paired' | 'public'

type RecognitionBoardShape = {
  title: string
  subtitle: string
}

type PublishableSlide<TBoard extends RecognitionBoardShape> = {
  id: string
  kind: string
  boardId?: string
  headline: string
  subtitle: string
  recognitionBoard?: TBoard
}

/**
 * Recognition slides are playable only when the published manifest carries
 * their immutable recognition dataset. The Web TV must never substitute the
 * local sample boards when a release is missing or malformed.
 */
export const toPublishedPlayerSlide = <
  TBoard extends RecognitionBoardShape,
  TSlide extends PublishableSlide<TBoard>,
>(item: TSlide): (TSlide & { board?: TBoard }) | null => {
  if (item.kind !== 'recognition') return item
  if (!item.recognitionBoard) return null
  return {
    ...item,
    board: {
      ...item.recognitionBoard,
      title: item.headline || item.recognitionBoard.title,
      subtitle: item.subtitle || item.recognitionBoard.subtitle,
    },
  }
}

/** Public TV is a global, always-on view of the latest published release. */
export const shouldApplyAudienceAndSchedule = (mode: PlayerMode) => mode === 'paired'

/** Public TV exposes only verified recognition datasets, never draft media. */
export const isPlayerItemAllowed = (mode: PlayerMode, kind: string) =>
  mode === 'paired' || kind === 'recognition'

/**
 * A public TV link starts on real recognition content even if an announcement
 * or video happens to be first in the stored playlist. Explicit item/board
 * deep links still win.
 */
export const prioritizePlayerSlides = <TSlide extends { id: string; kind: string; boardId?: string }>(
  slides: TSlide[],
  preferredItem: string | null,
  preferredBoard: string | null,
  mode: PlayerMode,
) => {
  const preferredIndex = preferredItem
    ? slides.findIndex((item) => item.id === preferredItem)
    : preferredBoard
      ? slides.findIndex((item) => item.boardId === preferredBoard)
      : mode === 'public'
        ? slides.findIndex((item) => item.kind === 'recognition')
        : -1

  if (preferredIndex <= 0) return slides
  const ordered = [...slides]
  const [preferred] = ordered.splice(preferredIndex, 1)
  ordered.unshift(preferred)
  return ordered
}
