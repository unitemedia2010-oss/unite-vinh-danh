import type { Board, Honoree } from '../types'

export const honoreeContextLabel = (group: Board['group'], person: Honoree) => {
  const value = (group === 'manager' ? person.branch || person.team : person.team || person.branch).trim()
  if (!value) return ''
  if (group !== 'manager' || /^khu\s+v(?:ự|u)c\b/i.test(value)) return value
  return `Khu vực ${value}`
}
