import type { Book, Format, SourceName, SourceRecord } from '../types'
import { normTitle } from './normalize'

export type ShelfId = 'all' | 'current' | 'finished' | 'want' | 'borrowed' | 'favorites' | 'dnf'
export const SHELVES: { id: ShelfId; label: string; short: string }[] = [
  { id: 'all', label: 'All Books', short: 'All' },
  { id: 'current', label: 'Currently Reading / Listening', short: 'Reading' },
  { id: 'finished', label: 'Finished', short: 'Finished' },
  { id: 'want', label: 'Want to Read', short: 'Want to Read' },
  { id: 'borrowed', label: 'Borrowed', short: 'Borrowed' },
  { id: 'favorites', label: 'Favorites', short: 'Favorites' },
  { id: 'dnf', label: 'Did Not Finish', short: 'Did Not Finish' },
]

export interface BookView { book: Book; sources: SourceRecord[]; formats: Format[]; services: SourceName[]; borrowed: boolean }

export function buildViews(books: Book[], sources: SourceRecord[]): BookView[] {
  const by = new Map<string, SourceRecord[]>()
  for (const s of sources) { const a = by.get(s.bookId); if (a) a.push(s); else by.set(s.bookId, [s]) }
  return books.map((book) => {
    const ss = by.get(book.id) ?? []
    return {
      book, sources: ss,
      formats: [...new Set(ss.map((s) => s.format).filter((f) => f !== 'unknown'))],
      services: [...new Set(ss.map((s) => s.source))],
      borrowed: ss.some((s) => s.activity === 'borrowed'),
    }
  })
}

export function inShelf(v: BookView, shelf: ShelfId): boolean {
  switch (shelf) {
    case 'all': return true
    case 'current': return v.book.status === 'in_progress'
    case 'finished': return v.book.status === 'finished'
    case 'want': return v.book.wantToRead
    case 'borrowed': return v.borrowed
    case 'favorites': return v.book.favorite
    case 'dnf': return v.book.status === 'dnf'
  }
}

export interface Filters { source: string; status: string; genre: string; format: string; author: string; series: string; minRating: number }
export const NO_FILTERS: Filters = { source: '', status: '', genre: '', format: '', author: '', series: '', minRating: 0 }
export type SortKey = 'added' | 'title' | 'author' | 'completed'

export function matchesQuery(v: BookView, q: string): boolean {
  const n = normTitle(q)
  if (!n) return true
  const hay = [v.book.title, v.book.subtitle, v.book.authors.join(' '), v.book.narrator, v.book.series].filter(Boolean).join(' ').toLowerCase()
  const ql = q.toLowerCase().trim()
  return hay.includes(ql) || normTitle(hay).includes(n)
}

export function applyAll(views: BookView[], shelf: ShelfId, q: string, f: Filters, sort: SortKey): BookView[] {
  const out = views.filter((v) =>
    inShelf(v, shelf) && matchesQuery(v, q) &&
    (!f.source || v.services.includes(f.source as SourceName)) &&
    (!f.status || v.book.status === f.status) &&
    (!f.genre || v.book.genres.includes(f.genre)) &&
    (!f.format || v.formats.includes(f.format as Format)) &&
    (!f.author || v.book.authors.includes(f.author)) &&
    (!f.series || v.book.series === f.series) &&
    (!f.minRating || (v.book.rating ?? 0) >= f.minRating))
  const t = (v: BookView) => normTitle(v.book.title)
  const a = (v: BookView) => (v.book.authors[0] ?? '~').split(' ').slice(-1)[0].toLowerCase()
  out.sort((x, y) => {
    switch (sort) {
      case 'title': return t(x).localeCompare(t(y))
      case 'author': return a(x).localeCompare(a(y)) || t(x).localeCompare(t(y))
      case 'completed': return (y.book.finishedAt ?? '').localeCompare(x.book.finishedAt ?? '')
      default: return y.book.createdAt.localeCompare(x.book.createdAt) || t(x).localeCompare(t(y))
    }
  })
  return out
}

export function distinct(views: BookView[], pick: (v: BookView) => (string | undefined)[]): string[] {
  return [...new Set(views.flatMap(pick).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b))
}

export const SERVICE_LABEL: Record<SourceName, string> = { audible: 'Audible', libby: 'Libby', hoopla: 'Hoopla', chatgpt: 'My list', screenshot: 'Screenshot', manual: 'Added by hand', other: 'Other' }
export const SERVICE_COLOR: Record<SourceName, string> = { audible: '#e8892b', libby: '#c8372d', hoopla: '#2f7bd6', chatgpt: '#6b8f71', screenshot: '#7a6a9a', manual: '#9bb5c0', other: '#9bb5c0' }
export const STATUS_LABEL = { unknown: 'Not marked', not_started: 'Not started', in_progress: 'Reading', finished: 'Finished', dnf: 'Did not finish' } as const
export const FORMAT_LABEL: Record<Format, string> = { audiobook: 'Audiobook', ebook: 'Ebook', print: 'Print', comic: 'Comic / graphic novel', unknown: 'Unknown' }
