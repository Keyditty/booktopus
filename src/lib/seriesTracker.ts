import { AUTO_MERGE, bestMatch } from './match'
import { normTitle } from './normalize'
import type { SeriesBook, SeriesResult } from './series'
import type { Book } from '../types'

/** One slot in a series: a book she has (owned) or one she doesn't have yet (missing). */
export interface SeriesEntry { position?: number; title: string; authors: string[]; coverUrl?: string; year?: number; owned?: Book }
export interface SeriesGroup {
  key: string; name: string
  entries: SeriesEntry[]
  finished: number; owned: number; total: number
  totalKnown: boolean // true when a series lookup told us the real size
  next?: SeriesEntry // the first book in order she hasn't finished (owned or not)
  state: 'in-progress' | 'not-started' | 'complete'
}

export const seriesKeyOf = (name: string) => normTitle(name).replace(/\b(series|trilogy|saga|chronicles)\b/g, '').replace(/\s+/g, ' ').trim()
const done = (b?: Book) => !!b && (b.status === 'finished' || b.readings.length > 0)

/** An entry from series data is "owned" if a shelf book matches its title (exact title is enough when the series data has no authors). */
export function matchOwned(e: { title: string; authors: string[] }, books: Book[]): Book | undefined {
  const hit = bestMatch({ title: e.title, authors: e.authors, identifiers: {} }, books)
  return hit && (hit.score >= AUTO_MERGE || (!e.authors.length && hit.score >= 0.78)) ? (hit.item as Book) : undefined
}

function finish(key: string, name: string, entries: SeriesEntry[], totalKnown: boolean): SeriesGroup {
  const total = entries.length
  const finished = entries.filter((e) => done(e.owned)).length
  const owned = entries.filter((e) => e.owned).length
  const next = entries.find((e) => !done(e.owned) && e.owned?.status !== 'dnf')
  const state = finished === total && total > 0 ? 'complete' : finished > 0 || entries.some((e) => e.owned?.status === 'in_progress') ? 'in-progress' : 'not-started'
  return { key, name, entries, finished, owned, total, totalKnown, next: state === 'complete' ? undefined : next, state }
}

/**
 * Build the tracker from the library. Books group by their series name. If a series lookup (cache) is supplied for a group,
 * its full list defines the entries; otherwise we use the books she has and fill obvious gaps (own #1 and #3, so #2 is missing).
 */
export function buildSeriesGroups(books: Book[], lookups: Map<string, SeriesResult> = new Map()): SeriesGroup[] {
  const by = new Map<string, { name: string; books: Book[] }>()
  for (const b of books) {
    if (!b.series?.trim()) continue
    const key = seriesKeyOf(b.series)
    const g = by.get(key) ?? { name: b.series.trim(), books: [] }
    g.books.push(b); by.set(key, g)
  }
  const groups: SeriesGroup[] = []
  for (const [key, g] of by) {
    const lookup = lookups.get(key)
    let entries: SeriesEntry[]
    if (lookup) {
      entries = lookup.books.map((x: SeriesBook) => ({ position: x.position, title: x.title, authors: x.authors, coverUrl: x.coverUrl, year: x.year, owned: matchOwned(x, books) }))
      // books she tagged with this series that the lookup didn't list: keep them, don't lose them
      for (const b of g.books) if (!entries.some((e) => e.owned?.id === b.id)) entries.push({ position: b.seriesNumber, title: b.title, authors: b.authors, coverUrl: b.coverUrl, year: b.year, owned: b })
      entries.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
    } else {
      const have = [...g.books].sort((a, b) => (a.seriesNumber ?? 1e9) - (b.seriesNumber ?? 1e9))
      entries = have.map((b) => ({ position: b.seriesNumber, title: b.title, authors: b.authors, coverUrl: b.coverUrl, year: b.year, owned: b }))
      const nums = have.map((b) => b.seriesNumber).filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
      if (nums.length) {
        const max = Math.max(...nums), gaps: SeriesEntry[] = []
        for (let n = 1; n < max; n++) if (!nums.includes(n)) gaps.push({ position: n, title: `Book ${n}`, authors: [] })
        entries = [...entries, ...gaps].sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
      }
    }
    groups.push(finish(key, lookup?.name ?? g.name, entries, !!lookup))
  }
  const rank = { 'in-progress': 0, 'not-started': 1, complete: 2 } as const
  return groups.sort((a, b) => rank[a.state] - rank[b.state] || b.finished - a.finished || a.name.localeCompare(b.name))
}
