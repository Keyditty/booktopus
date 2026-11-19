import { afterEach, describe, expect, it } from 'vitest'
import { findSeries, hardcoverSeries, inventaireSeries, testHardcover } from '../src/lib/series'

/* These tests use FAKE responses shaped like what the docs/search summaries describe. They prove the code copes with that shape
   and falls back sensibly. They do NOT prove the real services return that shape; that is what the Settings "Test connection" buttons are for. */
const real = globalThis.fetch
afterEach(() => { globalThis.fetch = real })
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })

describe('Hardcover series (fake responses)', () => {
  it('finds a book, then lists its series in order', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)); calls.push(body.query.slice(0, 20))
      expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc')
      if (body.query.includes('search(')) return json({ data: { search: { results: { hits: [{ document: { title: 'Fourth Wing', series_names: ['The Empyrean'] } }] } } } })
      return json({ data: { series: [{ id: 1, name: 'The Empyrean', books_count: 3, book_series: [
        { position: 2, book: { title: 'Iron Flame', release_year: 2023, cached_image: { url: 'https://x/i.jpg' }, cached_contributors: [{ author: { name: 'Rebecca Yarros' } }] } },
        { position: 1, book: { title: 'Fourth Wing', release_year: 2023, cached_contributors: [{ author: { name: 'Rebecca Yarros' } }] } }] }] } })
    }) as typeof fetch
    const r = (await hardcoverSeries({ title: 'Fourth Wing', author: 'Rebecca Yarros' }, 'abc'))!
    expect(r.name).toBe('The Empyrean'); expect(r.books.map((b) => b.title)).toEqual(['Iron Flame', 'Fourth Wing']) // order is whatever the API returns (it was asked to sort by position)
    expect(r.books[0].authors).toEqual(['Rebecca Yarros']); expect(r.books[0].coverUrl).toBe('https://x/i.jpg')
  })
  it('accepts a token that already starts with Bearer, and reports API errors readably', async () => {
    globalThis.fetch = (async (_u: string, init?: RequestInit) => { expect((init!.headers as Record<string, string>).authorization).toBe('Bearer zzz'); return json({ errors: [{ message: 'Invalid token' }] }) }) as typeof fetch
    const t = await testHardcover('Bearer zzz')
    expect(t.ok).toBe(false); expect(t.message).toBe('Invalid token')
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

describe('findSeries fallback', () => {
  it('falls back to Inventaire when Hardcover has no token, and says what happened', async () => {
    globalThis.fetch = (async () => json({ results: [] })) as typeof fetch
    const o = await findSeries({ title: 'Unknown Book' })
    expect(o.result).toBeNull()
    expect(o.notes.join(' ')).toContain('Hardcover skipped'); expect(o.notes.join(' ')).toContain('Inventaire')
  })
  it('turns network failures into a plain message', async () => {
    globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
    const o = await findSeries({ title: 'X' })
    expect(o.notes.join(' ')).toContain('blocked or offline')
  })
})
