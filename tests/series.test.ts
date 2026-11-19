import { afterEach, describe, expect, it } from 'vitest'
import { cleanToken, findSeries, friendlyHardcoverError, hardcoverSeries, inventaireSeries, testHardcover } from '../src/lib/series'

/* These tests use FAKE responses shaped like what the docs/search summaries describe. They prove the code copes with that shape
   and falls back sensibly. They do NOT prove the real services return that shape; that is what the Settings "Test connection" buttons are for. */
const real = globalThis.fetch
afterEach(() => { globalThis.fetch = real })
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })

describe('Hardcover series (fake responses)', () => {
  const seriesRows = [{ id: 1, name: 'The Empyrean', books_count: 3, book_series: [
    { position: 2, book: { title: 'Iron Flame', release_year: 2023, cached_image: { url: 'https://x/i.jpg' }, cached_contributors: [{ author: { name: 'Rebecca Yarros' } }] } },
    { position: 1, book: { title: 'Fourth Wing', release_year: 2023, cached_contributors: [{ author: { name: 'Rebecca Yarros' } }] } }] }]
  it('never sends _ilike (Hardcover rejects it), finds the exact series name via book search, and sorts by position', async () => {
    const queries: string[] = []
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)); queries.push(body.query)
      expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc')
      if (body.query.includes('search(')) return json({ data: { search: { results: { hits: [{ document: { title: 'Fourth Wing', series_names: ['The Empyrean'] } }] } } } })
      expect(body.variables.n).toBe('The Empyrean')
      return json({ data: { series: seriesRows } })
    }) as typeof fetch
    const r = (await hardcoverSeries({ title: 'Fourth Wing', author: 'Rebecca Yarros' }, 'abc'))!
    expect(queries.some((q) => /ilike/i.test(q))).toBe(false)
    expect(r.name).toBe('The Empyrean'); expect(r.books.map((b) => b.title)).toEqual(['Fourth Wing', 'Iron Flame'])
    expect(r.books[1].authors).toEqual(['Rebecca Yarros']); expect(r.books[1].coverUrl).toBe('https://x/i.jpg')
  })
  it('uses a saved series name directly, and falls back to a smaller query if a field is rejected', async () => {
    let calls = 0
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)); calls++
      if (body.query.includes('cached_image')) return json({ errors: [{ message: 'field "cached_image" not permitted' }] })
      return json({ data: { series: [{ id: 1, name: 'The Empyrean', book_series: [{ position: 1, book: { title: 'Fourth Wing' } }] }] } })
    }) as typeof fetch
    const r = (await hardcoverSeries({ title: 'x', series: 'The Empyrean' }, 'abc'))!
    expect(r.books.map((b) => b.title)).toEqual(['Fourth Wing']); expect(calls).toBe(2)
  })
  it('accepts a token that already starts with Bearer, and reports API errors readably', async () => {
    globalThis.fetch = (async (_u: string, init?: RequestInit) => { expect((init!.headers as Record<string, string>).authorization).toBe('Bearer zzz'); return json({ errors: [{ message: 'Invalid token' }] }) }) as typeof fetch
    const t = await testHardcover('Bearer zzz')
    expect(t.ok).toBe(false); expect(t.message).toContain('Invalid token'); expect(t.message).toContain('didn’t accept this token')
  })
})

describe('pasted Hardcover tokens (the phone paste problem)', () => {
  it('cleans line breaks, spaces, invisible characters, quotes and a pasted "Bearer "', () => {
    expect(cleanToken('  Bearer abc.def\n.ghi \u200B ')).toBe('abc.def.ghi')
    expect(cleanToken('“abc def”')).toBe('abcdef')
    expect(cleanToken('abc\u00A0def\r\nxyz')).toBe('abcdefxyz')
  })
  it('the test checks book data, so a token that cannot read account details still passes', async () => {
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc.def')
      if (body.query.includes('me {')) return json({ errors: [{ message: 'insufficient_scope' }] })
      return json({ data: { series: [{ id: 1, name: 'Dune' }] } })
    }) as typeof fetch
    const t = await testHardcover('abc.\ndef')
    expect(t.ok).toBe(true); expect(t.message).toContain('Connected'); expect(t.message).toContain('token length 7')
  })
  it('explains insufficient_scope in plain English when book data is blocked too', async () => {
    globalThis.fetch = (async () => json({ errors: [{ message: 'insufficient_scope' }] })) as typeof fetch
    const t = await testHardcover('abcdef')
    expect(t.ok).toBe(false); expect(t.message).toContain('fresh token'); expect(t.message).toContain('insufficient_scope')
    expect(friendlyHardcoverError('something odd')).toBe('something odd')
  })
})

describe('Inventaire series (fake responses)', () => {
  it('searches a series by name and returns parts in order', async () => {
    globalThis.fetch = (async (u: string) => {
      if (u.includes('/search')) return json({ results: [{ id: 'Q1', uri: 'wd:Q1', label: 'The Empyrean' }] })
      if (u.includes('series-parts')) return json({ parts: [{ uri: 'wd:Q3', ordinal: '2' }, { uri: 'wd:Q2', ordinal: '1' }] })
      return json({ entities: { 'wd:Q2': { labels: { en: 'Fourth Wing' } }, 'wd:Q3': { labels: { en: 'Iron Flame' } } } })
    }) as typeof fetch
    const r = (await inventaireSeries({ title: 'Fourth Wing', series: 'The Empyrean' }))!
    expect(r.books.map((b) => `${b.position}:${b.title}`)).toEqual(['1:Fourth Wing', '2:Iron Flame'])
  })
})

describe('Inventaire: series found through a book gets its real name', () => {
  it('reads the work\'s series claim, then the series label', async () => {
    globalThis.fetch = (async (u: string) => {
      if (u.includes('types=works')) return json({ results: [{ id: 'Q2', uri: 'wd:Q2', label: 'Fourth Wing' }] })
      if (u.includes('series-parts')) return json({ parts: [{ uri: 'wd:Q2', ordinal: '1' }, { uri: 'wd:Q3', ordinal: '2' }] })
      if (decodeURIComponent(u).includes('uris=wd:Q2|')) return json({ entities: { 'wd:Q2': { labels: { en: 'Fourth Wing' } }, 'wd:Q3': { labels: { en: 'Iron Flame' } } } })
      if (decodeURIComponent(u).endsWith('uris=wd:Q2')) return json({ entities: { 'wd:Q2': { claims: { 'wdt:P179': ['wd:Q1'] } } } })
      return json({ entities: { 'wd:Q1': { labels: { en: 'The Empyrean' } } } })
    }) as typeof fetch
    const r = (await inventaireSeries({ title: 'Fourth Wing', author: 'Rebecca Yarros' }))!
    expect(r.name).toBe('The Empyrean'); expect(r.books.map((b) => b.title)).toEqual(['Fourth Wing', 'Iron Flame'])
  })
})

describe('findSeries fallback', () => {
  it('skips Hardcover without a token, tries Inventaire, and reports why nothing was found', async () => {
    globalThis.fetch = (async () => json({ results: [] })) as typeof fetch
    const o = await findSeries({ title: 'Unknown Book' })
    expect(o.result).toBeNull()
    expect(o.notes.join(' ')).not.toContain('Hardcover'); expect(o.notes.join(' ')).toContain('Inventaire')
  })
  it('turns network failures into a plain message', async () => {
    globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
    const o = await findSeries({ title: 'X' })
    expect(o.notes.join(' ')).toContain('blocked or offline')
  })
})
