import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { db } from '../src/lib/db'
import { cleanBook, exportJson, restoreJson } from '../src/lib/export'
import { commitImport, loadLibrary, planImport, setStatus } from '../src/lib/store'
import type { Candidate } from '../src/types'

beforeEach(async () => { await freshDb() })
const cand = (t: string): Candidate => ({ title: t, authors: ['A B'], format: 'ebook', source: 'libby', identifiers: {}, activity: 'borrowed', events: [{ type: 'borrowed', date: '2026-01-02' }], confidence: 1, provenance: 't' })

describe('backup and restore', () => {
  it('round-trips everything: books, copies, history, finish dates, ratings', async () => {
    await commitImport(planImport([cand('One'), cand('Two')], []).map((i) => ({ ...i, include: true })), { adapter: 't', label: 't' })
    const id = (await db.books.toArray())[0].id
    await setStatus(id, 'finished'); await db.books.update(id, { rating: 5, spice: 3, genres: ['Romantasy'] })
    const json = await exportJson()
    await db.books.clear(); await db.sources.clear(); await db.events.clear(); await db.batches.clear()
    expect(await restoreJson(json)).toBe(2)
    const lib = await loadLibrary()
    expect(lib.books).toHaveLength(2); expect(lib.sources).toHaveLength(2); expect(lib.events).toHaveLength(2)
    expect(lib.books.find((b) => b.id === id)).toMatchObject({ status: 'finished', rating: 5, spice: 3, genres: ['Romantasy'] })
  })
  it('rejects files that are not backups, with friendly messages', async () => {
    await expect(restoreJson('not json at all')).rejects.toThrow(/readable backup/)
    await expect(restoreJson('{"hello":1}')).rejects.toThrow(/not a Booktopus backup/)
    await expect(restoreJson(JSON.stringify({ app: 'booktopus', books: [{ nope: true }] }))).rejects.toThrow(/readable books/)
  })
  it('repairs old or damaged records instead of letting them crash the app', () => {
    const b = cleanBook({ id: 'x', title: 'Old Backup Book', genres: 'not-an-array', status: 'weird', readings: 7, authors: null })!
    expect(b.genres).toEqual([]); expect(b.authors).toEqual([]); expect(b.readings).toEqual([]); expect(b.status).toBe('unknown'); expect(b.userEdited).toEqual([])
    expect(cleanBook({ id: '', title: 'x' })).toBeNull(); expect(cleanBook({ id: 'y', title: '   ' })).toBeNull()
  })
  it('skips copies and history that point at books that are not in the file', async () => {
    const json = JSON.stringify({ app: 'booktopus', books: [{ id: 'b1', title: 'Real' }], sources: [{ id: 's1', bookId: 'b1', key: 'k' }, { id: 's2', bookId: 'ghost', key: 'k2' }], events: [{ id: 'e1', bookId: 'ghost', sourceRecordId: 's2', key: 'x' }] })
    await restoreJson(json)
    const lib = await loadLibrary(); expect(lib.sources.map((s) => s.id)).toEqual(['s1']); expect(lib.events).toHaveLength(0)
  })
})
