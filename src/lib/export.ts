import { db } from './db'
import { notify } from './store'
import type { Book, SourceRecord } from '../types'
import { saveSettings } from './settings'

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

const STATUSES = ['unknown', 'not_started', 'in_progress', 'finished', 'dnf']
const FORMATS = ['audiobook', 'ebook', 'print', 'comic', 'unknown']
const ACTIVITIES = ['purchased', 'borrowed', 'returned', 'hold', 'available', 'unknown']
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : [])
const optStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Rebuild a book from untrusted JSON: fill every field the app relies on, drop anything unusable. Older backups may lack newer fields. */
export function cleanBook(r: any): Book | null {
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.title !== 'string' || !r.title.trim()) return null
  const now = new Date().toISOString()
  return {
    id: r.id, title: r.title, subtitle: optStr(r.subtitle), authors: strArr(r.authors), narrator: optStr(r.narrator), series: optStr(r.series), seriesNumber: optNum(r.seriesNumber),
    synopsis: optStr(r.synopsis), genres: strArr(r.genres), year: optNum(r.year), coverUrl: optStr(r.coverUrl), identifiers: r.identifiers && typeof r.identifiers === 'object' ? r.identifiers : {},
    status: STATUSES.includes(r.status) ? r.status : 'unknown', statusSource: r.statusSource === 'import' ? 'import' : 'user', wantToRead: !!r.wantToRead, favorite: !!r.favorite,
    arm: typeof r.arm === 'number' && r.arm >= 0 && r.arm < 8 ? r.arm : undefined, rating: optNum(r.rating), spice: optNum(r.spice), notes: optStr(r.notes),
    startedAt: optStr(r.startedAt), finishedAt: optStr(r.finishedAt),
    readings: Array.isArray(r.readings) ? r.readings.filter((x: any) => x && typeof x === 'object').map((x: any) => ({ startedAt: optStr(x.startedAt), finishedAt: optStr(x.finishedAt) })) : [],
    userEdited: strArr(r.userEdited), createdAt: optStr(r.createdAt) ?? now, updatedAt: optStr(r.updatedAt) ?? now, createdBatchId: optStr(r.createdBatchId),
  }
}
export function cleanSource(r: any): SourceRecord | null {
  if (!r || typeof r.id !== 'string' || typeof r.bookId !== 'string' || typeof r.key !== 'string') return null
  return { id: r.id, bookId: r.bookId, key: r.key, source: typeof r.source === 'string' ? r.source : 'other', format: FORMATS.includes(r.format) ? r.format : 'unknown', sourceId: optStr(r.sourceId),
    activity: ACTIVITIES.includes(r.activity) ? r.activity : 'unknown', borrowedAt: optStr(r.borrowedAt), returnedAt: optStr(r.returnedAt), library: optStr(r.library),
    provenance: optStr(r.provenance) ?? 'Restored from backup', batchId: optStr(r.batchId) ?? 'restored', addedAt: optStr(r.addedAt) ?? new Date().toISOString() }
}

/** Restores a backup. Returns how many books were restored; anything unusable in the file is skipped rather than allowed to break the app. */
export async function restoreJson(text: string): Promise<number> {
  let d: any
  try { d = JSON.parse(text) } catch { throw new Error('That file isn’t a readable backup (it may be damaged).') }
  if (!d || (d.app !== 'booktopus' && d.app !== 'tonis-bookshelf') || !Array.isArray(d.books)) throw new Error('That file is not a Booktopus backup.')
  const books = d.books.map(cleanBook).filter((b: Book | null): b is Book => !!b)
  const ids = new Set(books.map((b: Book) => b.id))
  const sources = (Array.isArray(d.sources) ? d.sources : []).map(cleanSource).filter((x: SourceRecord | null): x is SourceRecord => !!x && ids.has(x.bookId))
  const srcIds = new Set(sources.map((x: SourceRecord) => x.id))
  const events = (Array.isArray(d.events) ? d.events : []).filter((e: any) => e && typeof e.id === 'string' && ids.has(e.bookId) && srcIds.has(e.sourceRecordId) && typeof e.key === 'string')
    .map((e: any) => ({ id: e.id, bookId: e.bookId, sourceRecordId: e.sourceRecordId, key: e.key, type: typeof e.type === 'string' ? e.type : 'other', date: optStr(e.date), detail: optStr(e.detail), batchId: optStr(e.batchId) ?? 'restored' }))
  const batches = (Array.isArray(d.batches) ? d.batches : []).filter((x: any) => x && typeof x.id === 'string').map((x: any) => ({ id: x.id, adapter: String(x.adapter ?? 'restored'), label: String(x.label ?? 'Restored'), createdAt: optStr(x.createdAt) ?? new Date().toISOString(), booksCreated: optNum(x.booksCreated) ?? 0, booksMerged: optNum(x.booksMerged) ?? 0, sourceRecords: optNum(x.sourceRecords) ?? 0, events: optNum(x.events) ?? 0, undone: !!x.undone }))
  if (!books.length) throw new Error('That backup doesn’t contain any readable books.')
  await db.transaction('rw', [db.books, db.sources, db.events, db.batches], async () => {
    await db.books.bulkPut(books); await db.sources.bulkPut(sources); await db.events.bulkPut(events); await db.batches.bulkPut(batches)
  })
  notify()
  return books.length
}

/** Download a backup file and remember when, so the app can gently remind her to do it again. */
export async function downloadBackup() {
  download(`booktopus-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportJson(), 'application/json')
  saveSettings({ lastBackupAt: new Date().toISOString() })
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
