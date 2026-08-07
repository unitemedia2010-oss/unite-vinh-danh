import type { Board, Honoree } from '../types'

export const honoreeContextLabel = (group: Board['group'], person: Honoree) => {
  const value = (group === 'manager' ? person.branch || person.team : person.team || person.branch).trim()
  if (!value) return ''
  if (group !== 'manager' || /^khu\s+v(?:ự|u)c\b/i.test(value)) return value
  return `Khu vực ${value}`
}

/** Preserve accounting ranks even when Admin temporarily hides one person. */
export const podiumHonorees = (honorees: readonly Honoree[]): Honoree[] => {
  const byRank = new Map(honorees.map((person) => [person.rank, person]))
  return [2, 1, 3]
    .map((rank) => byRank.get(rank))
    .filter((person): person is Honoree => Boolean(person))
}

export const rankingListHonorees = (honorees: readonly Honoree[]): Honoree[] =>
  honorees
    .filter((person) => person.rank > 3)
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 7)
