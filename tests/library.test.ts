import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { db } from '../src/lib/db'
import { commitImport, planImport, planOne, loadLibrary, setStatus, undoBatch, updateBook, mergeBooks } from '../src/lib/store'
import { parseLibby } from '../src/lib/importers/libby'
import { parseBookText } from '../src/lib/importers/text'
import { parseListing } from '../src/lib/importers/listing'
import { enrichCandidates, applyMeta } from '../src/lib/metadata'

const LIBBY = `title,author,isbn,timestamp,activity,library,format
Project Hail Mary,Andy Weir,9780593135204,2025-02-01,Borrowed,City Library,eBook
Project Hail Mary,Andy Weir,9780593135204,2025-02-20,Returned,City Library,eBook
Dune,Frank Herbert,,2025-03-05,Borrowed,City Library,eBook`

async function run(cands: ReturnType<typeof parseLibby>['candidates'], adapter = 'libby') {
  const books = await db.books.toArray()
  const items = planImport(cands, books)
  return commitImport(items, { adapter, label: adapter })
}

beforeEach(async () => { await freshDb() })

describe('idempotent imports', () => {
  it('importing the same Libby file twice creates no duplicates', async () => {
    await run(parseLibby(LIBBY).candidates)
    const first = await loadLibrary()
    expect(first.books).toHaveLength(2)
    await run(parseLibby(LIBBY).candidates)
    const second = await loadLibrary()
    expect(second.books).toHaveLength(2)
    expect(second.sources).toHaveLength(first.sources.length)
    expect(second.events).toHaveLength(first.events.length)
  })
  it('a newer export adds only the new records', async () => {
    await run(parseLibby(LIBBY).candidates)
    await run(parseLibby(LIBBY + '\nCirce,Madeline Miller,,2025-04-01,Borrowed,City Library,eBook\nDune,Frank Herbert,,2025-04-10,Returned,City Library,eBook').candidates)
    const lib = await loadLibrary()
    expect(lib.books).toHaveLength(3)
    expect(lib.events).toHaveLength(5)
    const dune = lib.books.find((b) => b.title === 'Dune')!
    expect(lib.sources.find((s) => s.bookId === dune.id)!.activity).toBe('returned')
  })
  it('re-pasting a ChatGPT list does not duplicate', async () => {
    const txt = '1. Circe by Madeline Miller\n2. Dune by Frank Herbert'
    await run(parseBookText(txt).candidates, 'text')
    await run(parseBookText(txt).candidates, 'text')
    expect((await loadLibrary()).books).toHaveLength(2)
  })
})

describe('duplicates across services', () => {
  it('Audible + Libby copies of one book become one book with two sources', async () => {
    await run(parseListing('Project Hail Mary\nBy: Andy Weir\nNarrated by: Ray Porter', 'audible').candidates, 'audible')
    await run(parseLibby(LIBBY).candidates)
    const lib = await loadLibrary()
    const phm = lib.books.filter((b) => b.title === 'Project Hail Mary')
    expect(phm).toHaveLength(1)
    const recs = lib.sources.filter((s) => s.bookId === phm[0].id)
    expect(recs.map((r) => r.source).sort()).toEqual(['audible', 'libby'])
    expect(phm[0].narrator).toBe('Ray Porter')
  })
  it('detects the same book across several screenshots in one batch', () => {
    const a = parseListing('Circe\nBy: Madeline Miller', 'audible').candidates
    const b = parseListing('Circe\nBy: Madeline Miller\nNarrated by: Perdita Weeks', 'audible').candidates
    const items = planImport([...a, ...b], [])
    expect(items).toHaveLength(1)
    expect(items[0].detections).toBe(2)
    expect(items[0].candidate.narrator).toBe('Perdita Weeks')
  })
  it('keeps both services when one batch lists the same book twice from different sources', async () => {
    const a = parseListing('Project Hail Mary\nBy: Andy Weir', 'audible').candidates
    const b = parseLibby(LIBBY).candidates.filter((c) => c.title === 'Project Hail Mary')
    await run([...a, ...b], 'mixed')
    const lib = await loadLibrary()
    expect(lib.books).toHaveLength(1)
    expect(lib.sources.map((s) => s.source).sort()).toEqual(['audible', 'libby'])
    expect(lib.events).toHaveLength(2)
    await run([...a, ...b], 'mixed') // and repeating is still a no-op
    const again = await loadLibrary()
    expect(again.sources).toHaveLength(2); expect(again.events).toHaveLength(2)
  })
  it('does not merge different books in a series', () => {
    const items = planImport([
      ...parseBookText('1. Dune by Frank Herbert\n2. Dune Messiah by Frank Herbert\n3. Harry Potter and the Chamber of Secrets by J.K. Rowling\n4. Harry Potter and the Prisoner of Azkaban by J.K. Rowling').candidates,
      ...parseBookText('Wool Book 1 by Hugh Howey\nWool Book 2 by Hugh Howey').candidates,
    ], [])
    expect(items).toHaveLength(6)
  })
  it('flags a possible duplicate instead of silently merging', async () => {
    await run(parseBookText('Circe by Madeline Miller').candidates, 'text')
    const items = planImport(parseBookText('- Circe').candidates, await db.books.toArray())
    expect(items[0].category).toBe('possible')
    expect(items[0].include).toBe(false)
  })
})

describe('reading status vs source activity', () => {
  it('a returned Libby loan is not "finished"; a purchase is not "started"', async () => {
    await run(parseLibby(LIBBY).candidates)
    await run(parseListing('Circe\nBy: Madeline Miller', 'audible').candidates, 'audible')
    const lib = await loadLibrary()
    expect(lib.books.every((b) => b.status === 'unknown')).toBe(true)
    expect(lib.sources.find((s) => s.activity === 'returned')).toBeTruthy()
  })
  it('later imports never overwrite a user-set status or edited fields', async () => {
    await run(parseListing('Circe\nBy: Madeline Miller\nFinished', 'audible').candidates, 'audible')
    let b = (await loadLibrary()).books[0]
    expect(b.status).toBe('finished') // explicit source statement is retained
    await setStatus(b.id, 'dnf')
    await updateBook(b.id, { title: 'Circe (my copy)' })
    await run(parseListing('Circe\nBy: Madeline Miller\nFinished', 'audible').candidates, 'audible')
    b = (await loadLibrary()).books[0]
    expect(b.status).toBe('dnf')
    expect(b.title).toBe('Circe (my copy)')
  })
})

describe('undo, merge, persistence', () => {
  it('undoes an import batch', async () => {
    const batch = await run(parseLibby(LIBBY).candidates)
    expect((await loadLibrary()).books).toHaveLength(2)
    await undoBatch(batch.id)
    const lib = await loadLibrary()
    expect(lib.books).toHaveLength(0); expect(lib.sources).toHaveLength(0); expect(lib.events).toHaveLength(0)
  })
  it('manual merge moves sources onto one book', async () => {
    await run(parseBookText('Circe by Madeline Miller').candidates, 'text')
    await run(parseListing('Circe Reimagined\nBy: Madeline M.', 'audible').candidates, 'audible')
    let lib = await loadLibrary()
    if (lib.books.length === 2) { await mergeBooks(lib.books[0].id, lib.books[1].id); lib = await loadLibrary() }
    expect(lib.books).toHaveLength(1)
    expect(lib.sources.length).toBe(2)
  })
  it('data survives closing and reopening the database', async () => {
    const name = db.name
    await run(parseLibby(LIBBY).candidates)
    db.close()
    const { ShelfDB } = await import('../src/lib/db')
    const reopened = new ShelfDB(name)
    expect(await reopened.books.count()).toBe(2)
  })
})

describe('metadata enrichment', () => {
  it('uses provider data when confident and flags unmatched entries (fetch mocked)', async () => {
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const u = String(url)
      if (u.includes('googleapis')) {
        const hit = u.toLowerCase().includes('hail')
        return new Response(JSON.stringify(hit ? { items: [{ id: 'gb1', volumeInfo: { title: 'Project Hail Mary', authors: ['Andy Weir'], description: '<p>A lone astronaut.</p>', publishedDate: '2021-05-04', categories: ['Fiction / Science Fiction'], imageLinks: { thumbnail: 'http://books.google.com/x.jpg' }, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593135204' }] } }] } : {}), { status: 200 })
      }
      return new Response(JSON.stringify({ docs: [] }), { status: 200 })
    }) as typeof fetch
    try {
      const [a, b] = parseBookText('Project Hail Mry by Andy Weir\nZzzx Qqqq by Nobody Real').candidates
      await enrichCandidates([a, b])
      expect(a.enriched).toBe('matched'); expect(a.title).toBe('Project Hail Mary')
      expect(a.coverUrl).toMatch(/^https:/); expect(a.genres).toContain('Fiction')
      expect(b.enriched).toBe('unmatched')
      const items = planImport([a, b], [])
      expect(items.find((i) => i.candidate.title === 'Project Hail Mary')!.category).toBe('new')
      expect(items.find((i) => i.candidate.title.startsWith('Zzzx'))!.category).toBe('review')
    } finally { globalThis.fetch = real }
  })
  it('applyMeta leaves low-confidence matches for review', () => {
    const c = parseBookText('Something by Someone').candidates[0]
    applyMeta(c, { title: 'Totally Else', authors: ['X'], genres: [], identifiers: {}, score: 0.62, provider: 'openlibrary' })
    expect(c.title).toBe('Something')
    expect(c.confidence).toBeLessThanOrEqual(0.6)
  })
})

describe('manual add', () => {
  const manual = (title: string, author: string) => ({ title, authors: [author], format: 'ebook' as const, source: 'manual' as const, identifiers: {}, activity: 'unknown' as const, events: [], confidence: 1, provenance: 'Added by hand' })
  it('adds a hand-typed book, and the same book typed again is flagged, not duplicated', async () => {
    const first = planImport([manual('Circe', 'Madeline Miller')], await db.books.toArray())
    await commitImport(first.map((i) => ({ ...i, include: true })), { adapter: 'manual', label: 'x' })
    expect((await loadLibrary()).books).toHaveLength(1)
    const again = planImport([manual('circe', 'Madeline Miller')], await db.books.toArray())
    expect(again[0].category).toBe('existing')
    await commitImport(again.map((i) => ({ ...i, include: true })), { adapter: 'manual', label: 'y' })
    expect((await loadLibrary()).books).toHaveLength(1)
  })
  it('"different book" keeps a separate record', async () => {
    await commitImport(planImport([manual('Circe', 'Madeline Miller')], []).map((i) => ({ ...i, include: true })), { adapter: 'manual', label: 'x' })
    const item = planOne(manual('Circe', 'Madeline Miller'), await db.books.toArray())
    await commitImport([{ ...item, category: 'possible', matchBookId: undefined, include: true }], { adapter: 'manual', label: 'y' })
    expect((await loadLibrary()).books).toHaveLength(2)
  })
})
