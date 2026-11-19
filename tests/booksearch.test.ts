import { afterEach, describe, expect, it } from 'vitest'
import { looksLikeName, nameVariants, rankResults, searchAuthors, searchBooks, type Meta } from '../src/lib/metadata'

const real = globalThis.fetch
afterEach(() => { globalThis.fetch = real })
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
const meta = (title: string, authors: string[], popularity?: number): Meta => ({ title, authors, genres: [], identifiers: {}, score: 1, provider: 'google', popularity })

describe('author searches (the "steven king" problem)', () => {
  it('recognises names vs titles, and tries common first-name spellings', () => {
    expect(looksLikeName('steven king')).toBe(true); expect(looksLikeName('J. K. Rowling')).toBe(true)
    expect(looksLikeName('A Court of Thorns and Roses')).toBe(false); expect(looksLikeName('dune')).toBe(false)
    expect(nameVariants('steven king')).toEqual(['Stephen king']); expect(nameVariants('Sara Maas')).toEqual(['Sarah Maas']); expect(nameVariants('zed king')).toEqual([])
  })
  it('puts the famous author\'s books ahead of obscure namesakes, using spelling variants as matches', () => {
    const results = [meta('Dracula', ['steven king']), meta('Al Pacino!', ['Steven King']), meta('The Shining', ['Stephen King'], 90000), meta('It', ['Stephen King'], 120000), meta('A Fulde Country Practice', ['Steven King'], 3)]
    const ranked = rankResults(results, 'steven king', 'all', ['steven king', 'Stephen king']).map((m) => m.title)
    expect(ranked.slice(0, 2)).toEqual(['It', 'The Shining']) // famous first
    expect(ranked).toContain('Dracula') // namesakes still available, just lower
  })
  it('author mode hides unrelated keyword hits; title mode favours title matches', () => {
    const results = [meta('Stephen King Illustrated Guide', ['Somebody Else']), meta('Misery', ['Stephen King'], 50), meta('Carrie', ['Stephen King'], 40)]
    expect(rankResults(results, 'Stephen King', 'author').map((m) => m.title)).toEqual(['Misery', 'Carrie'])
    const t = [meta('Misery Loves Company', ['A B']), meta('Misery', ['Stephen King'], 50), meta('Cooking Basics', ['C D'])]
    expect(rankResults(t, 'misery', 'title')[0].title).toBe('Misery')
  })
  it('an exact author spelling beats its variant (picking "Stephen King" from the suggestions)', () => {
    const results = [meta('Dracula', ['Steven King']), meta('Al Pacino!', ['Steven King']), meta('The Shining', ['Stephen King'], 90000), meta('It', ['Stephen King'], 120000)]
    expect(rankResults(results, 'Stephen King', 'author', ['Stephen King', 'Steven King']).map((m) => m.title)).toEqual(['It', 'The Shining'])
  })
  it('sends author lookups (including the spelling variant) to Google and Open Library, and merges the answers', async () => {
    const asked: string[] = []
    globalThis.fetch = (async (u: string) => {
      const url = decodeURIComponent(String(u)); asked.push(url)
      if (url.includes('googleapis') && url.includes('inauthor:"Stephen king"')) return json({ items: [{ id: 'g1', volumeInfo: { title: 'The Shining', authors: ['Stephen King'], ratingsCount: 5000 } }] })
      if (url.includes('openlibrary.org/search.json') && url.includes('author=Stephen king')) return json({ docs: [{ key: '/works/1', title: 'It', author_name: ['Stephen King'], ratings_count: 9000 }] })
      return json({ items: [{ id: 'x', volumeInfo: { title: 'Dracula', authors: ['steven king'] } }] })
    }) as typeof fetch
    const r = await searchBooks('steven king', 10)
    expect(asked.some((u) => u.includes('inauthor:"steven king"'))).toBe(true); expect(asked.some((u) => u.includes('inauthor:"Stephen king"'))).toBe(true)
    expect(r.map((m) => m.title).slice(0, 2)).toEqual(['It', 'The Shining'])
  })
  it('suggests real authors ("Looking for an author?"), most prolific first', async () => {
    globalThis.fetch = (async (u: string) => decodeURIComponent(String(u)).includes('q=Stephen king') ? json({ docs: [{ name: 'Stephen King', work_count: 2100, top_work: 'The Shining' }] }) : json({ docs: [{ name: 'Steven King', work_count: 4 }] })) as typeof fetch
    const a = await searchAuthors('steven king')
    expect(a.map((x) => x.name)).toEqual(['Stephen King', 'Steven King']); expect(a[0]).toMatchObject({ works: 2100, topWork: 'The Shining' })
    expect(await searchAuthors('court of mist and fury')).toEqual([]) // not a name: no suggestions
  })
})
