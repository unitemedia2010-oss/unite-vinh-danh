import type { Board } from '../types'

export type RecognitionVisibilityTarget = 'person' | 'board'

export interface RecognitionVisibilityRule {
  id: string
  periodId: string
  targetType: RecognitionVisibilityTarget
  targetKey: string
  hidden: boolean
  reason: string
  updatedAt: string
}

export type BoardCodeMap = Readonly<Record<string, string>>

export const normalizeVisibilityKey = (value: string | undefined | null): string =>
  (value ?? '').trim().toUpperCase()

export const activeVisibilityKeys = (
  rules: readonly RecognitionVisibilityRule[],
  targetType: RecognitionVisibilityTarget,
): Set<string> => new Set(
  rules
    .filter((rule) => rule.hidden && rule.targetType === targetType)
    .map((rule) => normalizeVisibilityKey(rule.targetKey))
    .filter(Boolean),
)

export const isRecognitionBoardHidden = (
  boardId: string,
  rules: readonly RecognitionVisibilityRule[],
  boardCodes: BoardCodeMap,
): boolean => {
  const code = normalizeVisibilityKey(boardCodes[boardId] ?? boardId)
  return activeVisibilityKeys(rules, 'board').has(code)
}

export const isRecognitionPersonHidden = (
  entityCode: string | undefined,
  rules: readonly RecognitionVisibilityRule[],
): boolean => {
  const code = normalizeVisibilityKey(entityCode)
  return Boolean(code) && activeVisibilityKeys(rules, 'person').has(code)
}

/**
 * Creates the release-safe view without modifying accounting ranks. Hidden
 * people disappear, hidden boards disappear, and a board with no visible
 * honorees is omitted so TV/public share never receives an empty slide.
 */
export const applyRecognitionVisibility = (
  boards: readonly Board[],
  rules: readonly RecognitionVisibilityRule[],
  boardCodes: BoardCodeMap,
): Board[] => boards.flatMap((board) => {
  if (isRecognitionBoardHidden(board.id, rules, boardCodes)) return []
  const honorees = board.honorees.filter(
    (person) => !isRecognitionPersonHidden(person.entityCode, rules),
  )
  return honorees.length ? [{ ...board, honorees }] : []
})
