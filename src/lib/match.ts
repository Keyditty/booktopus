import type { Identifiers } from '../types'
import { authorsCompatible, normIsbn, normTitle, titleSimilarity } from './normalize'

export interface Matchable {
  title: string
  authors: string[]
  identifiers: Identifiers
}

export interface MatchResult<T> {
  item: T
  score: number
  reason: 'identifier' | 'exact' | 'fuzzy' | 'title-only'
}

/** Strong identifier overlap (ISBN, ASIN, Google Books id, Open Library id, source id). */
export function identifiersOverlap(a: Identifiers, b: Identifiers): boolean {
  const ia = normIsbn(a.isbn), ib = normIsbn(b.isbn)
  if (ia && ib && ia === ib) return true
  if (a.asin && b.asin && a.asin === b.asin) return true
  if (a.gbId && b.gbId && a.gbId === b.gbId) return true
  if (a.olId && b.olId && a.olId === b.olId) return true
  if (a.sourceIds && b.sourceIds && a.sourceIds.some((s) => b.sourceIds!.includes(s))) return true
  return false
}

/**
 * Score how likely two records are the same book. Conservative by design:
 *   >= 0.9  same book (auto-merge)
 *   0.7-0.9 possible duplicate (needs review)
 *   < 0.7   different book
 */
export function scoreMatch(a: Matchable, b: Matchable): MatchResult<Matchable> | null {
  if (identifiersOverlap(a.identifiers, b.identifiers)) return { item: b, score: 1, reason: 'identifier' }
  const sim = titleSimilarity(a.title, b.title)
  if (sim < 0.8) return null
  const same = normTitle(a.title) === normTitle(b.title)
  const auth = authorsCompatible(a.authors, b.authors)
  if (auth === false) return null // same title, different author: different book
  if (auth === true) {
    if (same) return { item: b, score: 0.96, reason: 'exact' }
    if (sim >= 0.92) return { item: b, score: 0.9, reason: 'fuzzy' }
    return { item: b, score: 0.75, reason: 'fuzzy' }
  }
  // author unknown on one side
  return { item: b, score: same ? 0.78 : 0.7, reason: 'title-only' }
}

export function bestMatch<T extends Matchable>(target: Matchable, pool: T[]): MatchResult<T> | null {
  let best: MatchResult<T> | null = null
  for (const p of pool) {
    const r = scoreMatch(target, p)
    if (r && (!best || r.score > best.score)) best = { item: p, score: r.score, reason: r.reason }
  }
  return best
}

export const AUTO_MERGE = 0.9
export const POSSIBLE = 0.7
