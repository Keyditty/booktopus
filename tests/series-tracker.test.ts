import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { db } from '../src/lib/db'
import { buildSeriesGroups, dedupeSeriesBooks, matchOwned } from '../src/lib/seriesTracker'
import { cacheSeries, cachedSeries } from '../src/lib/series'
import { addSource, commitImport, deleteSource, loadLibrary, planImport, splitSource, updateSource } from '../src/lib/store'
import type { Book, Candidate } from '../src/types'

let n = 0
const book = (o: Partial<Book> = {}): Book => ({
  id: `b${++n}`, title: `Book ${n}`, authors: ['Ann Author'], genres: [], identifiers: {}, status: 'unknown', statusSource: 'user', wantToRead: false, favorite: false,
  readings: [], userEdited: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...o,
})
beforeEach(async () => { await freshDb() })

describe('series tracker', () => {
  it('groups by series, finds gaps, and picks the next book to read', () => {
    const books = [
      book({ title: 'Wing One', series: 'The Empyrean', seriesNumber: 1, status: 'finished' }),
      book({ title: 'Wing Three', series: 'The Empyrean', seriesNumber: 3 }),
      book({ title: 'Solo', series: 'Standalone Duo', seriesNumber: 1 }),
      book({ title: 'No series' }),
    ]
    const g = buildSeriesGroups(books)
    const emp = g.find((x) => x.name === 'The Empyrean')!
    expect(emp.entries.map((e) => `${e.position}:${e.owned ? 'own' : 'missing'}`)).toEqual(['1:own', '2:missing', '3:own'])
    expect(emp.finished).toBe(1); expect(emp.state).toBe('in-progress')
    expect(emp.next!.position).toBe(2) // the first unfinished book in order is the one she is missing
    expect(g.map((x) => x.name)).toEqual(['The Empyrean', 'Standalone Duo']) // in-progress first, no-series books ignored
  })
  it('uses a series lookup for the true size and marks owned books by title', () => {
    const books = [book({ title: 'Fourth Wing', series: 'The Empyrean', seriesNumber: 1, status: 'finished' }), book({ title: 'Iron Flame', series: 'The Empyrean', seriesNumber: 2 })]
    const lookup = { name: 'The Empyrean', provider: 'inventaire' as const, books: [{ position: 1, title: 'Fourth Wing', authors: [] }, { position: 2, title: 'Iron Flame', authors: [] }, { position: 3, title: 'Onyx Storm', authors: [] }] }
    const g = buildSeriesGroups(books, new Map([['empyrean', lookup]]))[0]
    expect(g.total).toBe(3); expect(g.totalKnown).toBe(true); expect(g.owned).toBe(2); expect(g.finished).toBe(1)
    expect(g.next!.title).toBe('Iron Flame'); expect(g.next!.owned).toBeTruthy()
  })
  it('knows when a series is complete, and treats a dnf book as skipped for "next"', () => {
    const done = [book({ title: 'A', series: 'S', seriesNumber: 1, status: 'finished' }), book({ title: 'B', series: 'S', seriesNumber: 2, status: 'finished' })]
    expect(buildSeriesGroups(done)[0].state).toBe('complete')
    const skipped = [book({ title: 'A', series: 'S', seriesNumber: 1, status: 'finished' }), book({ title: 'B', series: 'S', seriesNumber: 2, status: 'dnf' }), book({ title: 'C', series: 'S', seriesNumber: 3 })]
    expect(buildSeriesGroups(skipped)[0].next!.title).toBe('C')
  })
  it('matchOwned accepts an exact title when the series data has no authors', () => {
    expect(matchOwned({ title: 'Iron Flame', authors: [] }, [book({ title: 'Iron Flame', authors: ['Rebecca Yarros'] })])).toBeTruthy()
    expect(matchOwned({ title: 'Iron Flame', authors: [] }, [book({ title: 'Something Else' })])).toBeUndefined()
  })
  it('collapses the same book listed twice (movie tie-in), keeping the one with a cover', () => {
    const r = dedupeSeriesBooks([{ title: 'I Hope They Serve Beer in Hell', position: 1 }, { title: 'I Hope They Serve Beer In Hell (movie tie-in)', position: 1, coverUrl: 'c.jpg' }, { title: 'Assholes Finish First', position: 2 }])
    expect(r.map((x) => x.title)).toEqual(['I Hope They Serve Beer In Hell (movie tie-in)', 'Assholes Finish First']); expect(r[0].coverUrl).toBe('c.jpg')
  })
  it('caches series lookups under the series name (ignoring "series"/"trilogy")', async () => {
    await cacheSeries({ name: 'The Empyrean Series', provider: 'hardcover', books: [{ title: 'Fourth Wing', authors: [] }] })
    expect((await cachedSeries('the empyrean'))!.books).toHaveLength(1)
    expect(await cachedSeries('Something Else')).toBeNull()
  })
})

describe('editing where a book lives', () => {
  const cand = (): Candidate => ({ title: 'Project Hail Mary', authors: ['Andy Weir'], format: 'audiobook', source: 'audible', identifiers: {}, activity: 'purchased', events: [], confidence: 1, provenance: 't' })
  async function seed() { await commitImport(planImport([cand()], []).map((i) => ({ ...i, include: true })), { adapter: 't', label: 't' }); return loadLibrary() }

  it('changes service and format, adds another place, and removes one', async () => {
    const lib = await seed(); const rec = lib.sources[0]
    await updateSource(rec.id, { source: 'libby', format: 'ebook', activity: 'borrowed' })
    let l = await loadLibrary(); expect(l.sources).toHaveLength(1); expect(l.sources[0]).toMatchObject({ source: 'libby', format: 'ebook', activity: 'borrowed' })
    expect(await addSource(lib.books[0].id, { source: 'audible', format: 'audiobook' })).toBe(true)
    expect(await addSource(lib.books[0].id, { source: 'audible', format: 'audiobook' })).toBe(false) // already there
    l = await loadLibrary(); expect(l.sources.map((x) => x.source).sort()).toEqual(['audible', 'libby'])
    await deleteSource(l.sources[0].id); expect((await loadLibrary()).sources).toHaveLength(1)
  })
  it('re-importing after an edit does not duplicate the edited copy', async () => {
    const lib = await seed()
    await updateSource(lib.sources[0].id, { source: 'libby', format: 'ebook' })
    const again = { ...cand(), source: 'libby' as const, format: 'ebook' as const }
    await commitImport(planImport([again], await db.books.toArray()).map((i) => ({ ...i, include: true })), { adapter: 't2', label: 't2' })
    const l = await loadLibrary(); expect(l.books).toHaveLength(1); expect(l.sources).toHaveLength(1)
  })
  it('"Not the same book" splits one copy, with its history, into its own book', async () => {
    const c: Candidate = { ...cand(), events: [{ type: 'borrowed', date: '2026-01-02' }] }
    await commitImport(planImport([c], []).map((i) => ({ ...i, include: true })), { adapter: 't', label: 't' })
    let l = await loadLibrary(); await addSource(l.books[0].id, { source: 'libby', format: 'ebook' })
    l = await loadLibrary(); const audible = l.sources.find((x) => x.source === 'audible')!
    await splitSource(audible.id)
    l = await loadLibrary(); expect(l.books).toHaveLength(2)
    const moved = l.sources.find((x) => x.source === 'audible')!; const other = l.sources.find((x) => x.source === 'libby')!
    expect(moved.bookId).not.toBe(other.bookId); expect(l.events.every((e) => e.bookId === moved.bookId)).toBe(true)
  })
  it('merges two copies that become identical', async () => {
    const lib = await seed(); await addSource(lib.books[0].id, { source: 'libby', format: 'audiobook' })
    let l = await loadLibrary(); const audible = l.sources.find((x) => x.source === 'audible')!
    await updateSource(audible.id, { source: 'libby' })
    l = await loadLibrary(); expect(l.sources).toHaveLength(1)
  })
})
