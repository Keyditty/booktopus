import { db } from './db'
import { notify } from './store'
import type { Book, SourceRecord } from '../types'

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export async function exportCsv(): Promise<string> {
  const [books, sources] = await Promise.all([db.books.toArray(), db.sources.toArray()])
  const by = new Map<string, SourceRecord[]>()
  sources.forEach((s) => by.set(s.bookId, [...(by.get(s.bookId) ?? []), s]))
  const head = ['Title', 'Subtitle', 'Author', 'Narrator', 'Series', 'Series #', 'Status', 'Want to read', 'Favorite', 'Rating', 'Spice (0-5)', 'Date started', 'Date finished', 'Sources', 'Formats', 'Genres', 'ISBN', 'Year', 'Notes']
  const rows = books.map((b: Book) => [b.title, b.subtitle, b.authors.join('; '), b.narrator, b.series, b.seriesNumber, b.status, b.wantToRead ? 'yes' : '', b.favorite ? 'yes' : '', b.rating, b.spice, b.startedAt, b.finishedAt,
    [...new Set((by.get(b.id) ?? []).map((s) => s.source))].join('; '), [...new Set((by.get(b.id) ?? []).map((s) => s.format))].join('; '), b.genres.join('; '), b.identifiers.isbn, b.year, b.notes].map(q).join(','))
  return [head.map(q).join(','), ...rows].join('\n')
}

export async function exportJson(): Promise<string> {
  const [books, sources, events, batches] = await Promise.all([db.books.toArray(), db.sources.toArray(), db.events.toArray(), db.batches.toArray()])
  return JSON.stringify({ app: "booktopus", version: 1, exportedAt: new Date().toISOString(), books, sources, events, batches }, null, 2)
}

export async function restoreJson(text: string): Promise<number> {
  const d = JSON.parse(text)
  if ((d.app !== "booktopus" && d.app !== "tonis-bookshelf") || !Array.isArray(d.books)) throw new Error('That file is not a Booktopus backup.')
  await db.transaction('rw', [db.books, db.sources, db.events, db.batches], async () => {
    await db.books.bulkPut(d.books); await db.sources.bulkPut(d.sources ?? []); await db.events.bulkPut(d.events ?? []); await db.batches.bulkPut(d.batches ?? [])
  })
  notify()
  return d.books.length
}

export async function eraseAll() {
  await db.transaction('rw', [db.books, db.sources, db.events, db.batches], async () => { await Promise.all([db.books.clear(), db.sources.clear(), db.events.clear(), db.batches.clear()]) })
  notify()
}

export function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
