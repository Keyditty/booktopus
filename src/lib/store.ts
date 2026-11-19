import { db } from './db'
import { assignArms } from './arms'
import { bestMatch, AUTO_MERGE, POSSIBLE } from './match'
import { bookKeyOf, hashStr, newId } from './normalize'
import type { ActivityEvent, Book, Candidate, ImportBatch, ReviewCategory, ReviewItem, SourceActivity, SourceEntry, SourceRecord } from '../types'

const now = () => new Date().toISOString()

// ---- change notification for the UI ---------------------------------------
type Listener = () => void
const listeners = new Set<Listener>()
export const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }
export const notify = () => listeners.forEach((l) => l())

export interface LibraryData { books: Book[]; sources: SourceRecord[]; events: ActivityEvent[]; batches: ImportBatch[] }
export async function loadLibrary(): Promise<LibraryData> {
  const [books, sources, events, batches] = await Promise.all([db.books.toArray(), db.sources.toArray(), db.events.toArray(), db.batches.orderBy('createdAt').reverse().toArray()])
  return { books, sources, events, batches }
}

// ---- merge candidates within a batch (same book seen in several screenshots / platforms) -----
export function dedupeCandidates(cands: Candidate[]): { cand: Candidate; detections: number }[] {
  const groups: { cand: Candidate; detections: number }[] = []
  for (const c of cands) {
    const m = bestMatch({ title: c.title, authors: c.authors, identifiers: c.identifiers }, groups.map((g) => ({ ...g.cand, g })))
    if (m && m.score >= AUTO_MERGE) {
      const g = (m.item as unknown as { g: { cand: Candidate; detections: number } }).g
      mergeCandidate(g.cand, c)
      g.detections++
    } else groups.push({ cand: { ...c, events: [...c.events] }, detections: 1 })
  }
  return groups
}

function mergeCandidate(into: Candidate, from: Candidate) {
  for (const k of ['subtitle', 'narrator', 'series', 'seriesNumber', 'library', 'rating', 'notes', 'startedAt', 'finishedAt', 'synopsis', 'coverUrl', 'year', 'sourceId'] as const) {
    if (into[k] == null && from[k] != null) (into as unknown as Record<string, unknown>)[k] = from[k]
  }
  if (!into.authors.length) into.authors = from.authors
  into.identifiers = { ...from.identifiers, ...into.identifiers }
  const sameCopy = (a: { source: string; format: string }, b: { source: string; format: string }) => a.source === b.source && (a.format === b.format || a.format === 'unknown' || b.format === 'unknown')
  if (into.format === 'unknown') into.format = from.format
  const entry = (c: Candidate) => ({ source: c.source, format: c.format, sourceId: c.sourceId, activity: c.activity, library: c.library, completionHint: c.completionHint, provenance: c.provenance, events: c.events })
  if (sameCopy(into, from)) {
    const seen0 = new Set(into.events.map((e) => `${e.type}|${e.date}`))
    for (const e of from.events) if (!seen0.has(`${e.type}|${e.date}`)) into.events.push(e)
  } else {
    into.others = [...(into.others ?? []), entry(from), ...(from.others ?? [])]
  }
  if (from.status) into.status = from.status // later mention wins (a revised list)
  if (from.wantToRead != null) into.wantToRead = from.wantToRead
  if (from.favorite) into.favorite = true
  if (from.completionHint && !into.completionHint) into.completionHint = from.completionHint
  into.confidence = Math.max(into.confidence, from.confidence)
}

// ---- plan: compare candidates against the existing library -----------------------------------
export function planImport(cands: Candidate[], books: Book[]): ReviewItem[] {
  return dedupeCandidates(cands).map(({ cand, detections }) => planOne(cand, books, detections))
}

export function planOne(c: Candidate, books: Book[], detections = 1): ReviewItem {
  const m = bestMatch({ title: c.title, authors: c.authors, identifiers: c.identifiers }, books)
  let category: ReviewCategory
  let reason: string | undefined
  const weak = c.title.trim().length < 3 || (c.enriched === 'unmatched' && c.confidence < 0.9) || (c.enriched !== 'matched' && c.confidence < 0.6)
  if (m && m.score >= AUTO_MERGE) category = 'existing'
  else if (m && m.score >= POSSIBLE) { category = 'possible'; reason = `Looks similar to “${m.item.title}” already on your shelf` }
  else if (c.title.trim().length < 3) { category = 'unrecognized'; reason = 'Couldn’t read a title' }
  else if (weak) { category = 'review'; reason = c.enriched === 'unmatched' ? 'Couldn’t find this book online — please check the title' : 'Not sure this was read correctly' }
  else category = 'new'
  return {
    id: newId(), candidate: c, category, detections,
    matchBookId: m && m.score >= POSSIBLE ? m.item.id : undefined,
    matchTitle: m && m.score >= POSSIBLE ? m.item.title : undefined,
    matchScore: m?.score, reason,
    include: category === 'new' || category === 'existing',
  }
}

// ---- commit: idempotent write ----------------------------------------------------------------
export interface CommitOptions { adapter: string; label: string }

export async function commitImport(items: ReviewItem[], opts: CommitOptions): Promise<ImportBatch> {
  const batch: ImportBatch = { id: newId(), adapter: opts.adapter, label: opts.label, createdAt: now(), booksCreated: 0, booksMerged: 0, sourceRecords: 0, events: 0 }
  await db.transaction('rw', [db.books, db.sources, db.events, db.batches], async () => {
    const allBooks = await db.books.toArray()
    for (const it of items.filter((i) => i.include)) {
      const c = it.candidate
      let book: Book | undefined
      if (it.matchBookId && (it.category === 'existing' || it.category === 'possible' || it.category === 'review' || it.category === 'new')) {
        book = allBooks.find((b) => b.id === it.matchBookId)
      }
      if (!book) {
        // idempotency guard: re-check against the library as it is right now (earlier rows in this commit included)
        const m = bestMatch({ title: c.title, authors: c.authors, identifiers: c.identifiers }, allBooks)
        if (m && m.score >= AUTO_MERGE && it.category !== 'possible') book = m.item
      }
      if (!book) {
        book = newBookFrom(c, batch.id)
        allBooks.push(book)
        await db.books.add(book)
        batch.booksCreated++
      } else if (applyCandidate(book, c)) {
        await db.books.put(book)
        batch.booksMerged++
      } else batch.booksMerged++

      const bookKey = bookKeyOf(c.title, c.authors)
      const entries: SourceEntry[] = [
        { source: c.source, format: c.format, sourceId: c.sourceId, activity: c.activity, library: c.library, completionHint: c.completionHint, provenance: c.provenance, events: c.events },
        ...(c.others ?? []),
      ]
      for (const en of entries) {
        const key = `${en.source}|${en.format}|${en.sourceId || bookKey}`
        let rec = await db.sources.where('key').equals(key).and((r) => r.bookId === book!.id).first()
        if (!rec) {
          rec = { id: newId(), bookId: book.id, key, source: en.source, format: en.format, sourceId: en.sourceId, activity: en.activity, library: en.library, completionHint: en.completionHint, provenance: en.provenance, batchId: batch.id, addedAt: now() }
          await db.sources.add(rec)
          batch.sourceRecords++
        }
        for (const e of en.events) {
          const ekey = `${key}|${e.type}|${e.date || ''}`
          if (await db.events.where('key').equals(ekey).first()) continue
          await db.events.add({ id: newId(), bookId: book.id, sourceRecordId: rec.id, key: ekey, type: e.type, date: e.date, detail: e.detail, batchId: batch.id })
          batch.events++
        }
        await refreshSourceRecord(rec.id)
      }
    }
    await db.batches.add(batch)
  })
  notify()
  return batch
}

export function newBookFrom(c: Candidate, batchId: string): Book {
  const t = now()
  const status = c.status ?? 'unknown'
  return {
    id: newId(), title: c.title, subtitle: c.subtitle, authors: c.authors, narrator: c.narrator, series: c.series, seriesNumber: c.seriesNumber,
    synopsis: c.synopsis, genres: c.genres ?? [], year: c.year, coverUrl: c.coverUrl, identifiers: { ...c.identifiers },
    status: status === 'unknown' && c.completionHint ? (c.completionHint.value === 'finished' ? 'finished' : 'in_progress') : status,
    statusSource: 'import', wantToRead: !!c.wantToRead, favorite: !!c.favorite, rating: c.rating, notes: c.notes,
    startedAt: c.startedAt, finishedAt: c.finishedAt, readings: [], userEdited: [], createdAt: t, updatedAt: t, createdBatchId: batchId,
  }
}

/** Fill gaps on an existing book from imported data. Never touches user-edited fields or user-set status. Returns true if changed. */
export function applyCandidate(book: Book, c: Candidate): boolean {
  let changed = false
  const locked = new Set(book.userEdited)
  const fill = <K extends keyof Book>(k: K, v: Book[K] | undefined) => {
    if (v == null || locked.has(k as string)) return
    const cur = book[k]
    if (cur == null || (Array.isArray(cur) && cur.length === 0) || cur === '') { book[k] = v; changed = true }
  }
  fill('subtitle', c.subtitle); fill('narrator', c.narrator); fill('series', c.series); fill('seriesNumber', c.seriesNumber)
  fill('synopsis', c.synopsis); fill('coverUrl', c.coverUrl); fill('year', c.year); fill('rating', c.rating); fill('notes', c.notes)
  fill('startedAt', c.startedAt); fill('finishedAt', c.finishedAt)
  if (c.genres?.length) fill('genres', c.genres)
  if (c.authors.length) fill('authors', c.authors)
  const ids = { ...c.identifiers, ...book.identifiers }
  if (JSON.stringify(ids) !== JSON.stringify(book.identifiers)) { book.identifiers = ids; changed = true }
  // status: only explicit statements, only when the user hasn't decided
  if (book.statusSource !== 'user' && !locked.has('status')) {
    const explicit = c.status ?? (c.completionHint ? (c.completionHint.value === 'finished' ? 'finished' : 'in_progress') : undefined)
    if (explicit && (book.status === 'unknown' || book.status === 'not_started') && explicit !== book.status) { book.status = explicit; changed = true }
  }
  if (c.wantToRead && !book.wantToRead && !locked.has('wantToRead')) { book.wantToRead = true; changed = true }
  if (c.favorite && !book.favorite && !locked.has('favorite')) { book.favorite = true; changed = true }
  if (changed) book.updatedAt = now()
  return changed
}

/** Recompute a source record's current activity + borrow/return dates from its events. */
export async function refreshSourceRecord(id: string) {
  const rec = await db.sources.get(id)
  if (!rec) return
  const evs = (await db.events.where('bookId').equals(rec.bookId).toArray()).filter((e) => e.sourceRecordId === id)
  const dated = evs.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!))
  const lastOf = (t: string) => [...dated].reverse().find((e) => e.type === t)?.date
  const latest = [...dated].reverse().find((e) => ['borrowed', 'returned', 'hold', 'purchased'].includes(e.type))
  let activity: SourceActivity = rec.activity
  if (latest) activity = latest.type as SourceActivity
  else if (evs.some((e) => e.type === 'borrowed')) activity = 'borrowed'
  rec.activity = activity
  rec.borrowedAt = lastOf('borrowed') ?? rec.borrowedAt
  rec.returnedAt = lastOf('returned') ?? rec.returnedAt
  await db.sources.put(rec)
}

// ---- undo -------------------------------------------------------------------------------------
export async function undoBatch(batchId: string) {
  await db.transaction('rw', [db.books, db.sources, db.events, db.batches], async () => {
    await db.events.where('batchId').equals(batchId).delete()
    await db.sources.where('batchId').equals(batchId).delete()
    const created = await db.books.where('createdBatchId').equals(batchId).toArray()
    for (const b of created) {
      const remaining = await db.sources.where('bookId').equals(b.id).count()
      if (remaining === 0) await db.books.delete(b.id)
    }
    await db.batches.update(batchId, { undone: true })
  })
  notify()
}

// ---- manual edits -----------------------------------------------------------------------------
export async function updateBook(id: string, patch: Partial<Book>, userFields: string[] = Object.keys(patch)) {
  const b = await db.books.get(id)
  if (!b) return
  Object.assign(b, patch)
  b.userEdited = Array.from(new Set([...b.userEdited, ...userFields.filter((f) => !['updatedAt', 'readings', 'userEdited', 'statusSource'].includes(f))]))
  b.updatedAt = now()
  await db.books.put(b)
  notify()
}

export async function setStatus(id: string, status: Book['status']) {
  const b = await db.books.get(id)
  if (!b) return
  const today = now().slice(0, 10)
  b.status = status
  b.statusSource = 'user'
  if (status === 'in_progress') { b.startedAt = b.startedAt || today; b.wantToRead = false }
  if (status === 'finished') { b.finishedAt = b.finishedAt || today; b.wantToRead = false }
  if (status === 'dnf') b.wantToRead = false
  if (status !== 'in_progress') b.arm = undefined // finishing, dropping or un-marking frees the octopus arm
  b.updatedAt = now()
  await db.books.put(b)
  if (status === 'in_progress') await placeOnArm(id, 'reading')
  notify()
}

/**
 * Put a book on one of the octopus's eight arms, either "reading" now or "queued" (up next).
 * Returns false if all eight arms are already busy.
 */
export async function placeOnArm(id: string, mode: 'reading' | 'queued', slot?: number): Promise<boolean> {
  const all = await db.books.toArray()
  const b = all.find((x) => x.id === id)
  if (!b) return false
  const layout = assignArms(all)
  let idx = layout.findIndex((x) => x?.id === id)
  if (idx < 0) {
    idx = slot !== undefined && !layout[slot] ? slot : layout.findIndex((x) => !x)
    if (idx < 0) return false
  }
  for (let i = 0; i < layout.length; i++) { const x = layout[i]; if (x && x.id !== id && x.arm !== i) await db.books.update(x.id, { arm: i }) }
  b.arm = idx
  b.statusSource = 'user'
  if (mode === 'reading') { b.status = 'in_progress'; b.startedAt = b.startedAt || now().slice(0, 10); b.wantToRead = false }
  else { b.wantToRead = true; if (b.status === 'in_progress') b.status = 'not_started'; if (b.status === 'unknown') b.status = 'not_started' }
  b.updatedAt = now()
  await db.books.put(b)
  notify()
  return true
}

export async function removeFromArm(id: string) {
  const b = await db.books.get(id)
  if (!b) return
  const layout = assignArms(await db.books.toArray())
  for (let i = 0; i < layout.length; i++) { const x = layout[i]; if (x && x.id !== id && x.arm !== i) await db.books.update(x.id, { arm: i }) }
  b.arm = undefined
  if (b.status === 'in_progress') b.status = 'unknown'
  b.updatedAt = now()
  await db.books.put(b)
  notify()
}

export async function readAgain(id: string) {
  const b = await db.books.get(id)
  if (!b) return
  b.readings = [...b.readings, { startedAt: b.startedAt, finishedAt: b.finishedAt }]
  b.status = 'in_progress'; b.statusSource = 'user'; b.startedAt = now().slice(0, 10); b.finishedAt = undefined
  b.updatedAt = now()
  await db.books.put(b)
  notify()
}

export async function deleteBook(id: string) {
  await db.transaction('rw', [db.books, db.sources, db.events], async () => {
    await db.events.where('bookId').equals(id).delete()
    await db.sources.where('bookId').equals(id).delete()
    await db.books.delete(id)
  })
  notify()
}

export async function mergeBooks(keepId: string, otherId: string) {
  if (keepId === otherId) return
  await db.transaction('rw', [db.books, db.sources, db.events], async () => {
    const keep = await db.books.get(keepId), other = await db.books.get(otherId)
    if (!keep || !other) return
    for (const k of ['subtitle', 'narrator', 'series', 'seriesNumber', 'synopsis', 'coverUrl', 'year', 'rating', 'notes', 'startedAt', 'finishedAt'] as const) {
      if (keep[k] == null && other[k] != null) (keep as unknown as Record<string, unknown>)[k] = other[k]
    }
    keep.genres = Array.from(new Set([...keep.genres, ...other.genres]))
    keep.identifiers = { ...other.identifiers, ...keep.identifiers }
    keep.favorite = keep.favorite || other.favorite
    keep.wantToRead = keep.wantToRead || other.wantToRead
    if ((keep.status === 'unknown' || keep.status === 'not_started') && other.status !== 'unknown') { keep.status = other.status; keep.statusSource = other.statusSource }
    keep.readings = [...keep.readings, ...other.readings]
    keep.updatedAt = now()
    await db.books.put(keep)
    await db.sources.where('bookId').equals(otherId).modify({ bookId: keepId })
    await db.events.where('bookId').equals(otherId).modify({ bookId: keepId })
    await db.books.delete(otherId)
  })
  notify()
}

/** Pull one source record out of a book into its own new book ("these are different books"). */
export async function splitSource(recordId: string) {
  await db.transaction('rw', [db.books, db.sources, db.events], async () => {
    const rec = await db.sources.get(recordId)
    if (!rec) return
    const src = await db.books.get(rec.bookId)
    if (!src) return
    const t = now()
    const nb: Book = { ...src, id: newId(), status: 'unknown', statusSource: 'import', wantToRead: false, favorite: false, rating: undefined, notes: undefined, startedAt: undefined, finishedAt: undefined, readings: [], userEdited: [], createdAt: t, updatedAt: t, identifiers: { ...src.identifiers } }
    await db.books.add(nb)
    await db.sources.update(recordId, { bookId: nb.id })
    await db.events.where('sourceRecordId').equals(recordId).modify({ bookId: nb.id })
  })
  notify()
}

export const stableHash = hashStr
