import { describe, expect, it } from 'vitest'
import { normalizeGenre, withGenre } from '../src/lib/genres'
import { buildSeeds, makeSeed, notInLibrary, searchLinks } from '../src/lib/discover'
import type { Book } from '../src/types'

let n = 0
const book = (o: Partial<Book> = {}): Book => ({
  id: `b${++n}`, title: `Book ${n}`, authors: ['Ann Author'], genres: [], identifiers: {}, status: 'unknown', statusSource: 'user', wantToRead: false, favorite: false,
  readings: [], userEdited: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...o,
})

describe('custom genres', () => {
  it('normalizes typed genres and ignores duplicates in any case', () => {
    expect(normalizeGenre('  spicy   fantasy ')).toBe('Spicy Fantasy')
    expect(normalizeGenre('ya')).toBe('YA')
    expect(withGenre(['Romantasy'], 'romantasy')).toEqual(['Romantasy'])
    expect(withGenre(['Romantasy'], 'dark romance')).toEqual(['Romantasy', 'Dark Romance'])
    expect(withGenre([], '   ')).toEqual([])
  })
})

describe('discovery', () => {
  it('builds seeds from the author, genre and book she loved most', () => {
    const books = [
      book({ title: 'Circe', authors: ['Madeline Miller'], genres: ['Fantasy'], status: 'finished', favorite: true, rating: 5 }),
      book({ title: 'Song of Achilles', authors: ['Madeline Miller'], genres: ['Fantasy'], status: 'finished', rating: 4 }),
      book({ title: 'Other', authors: ['Someone Else'], genres: ['Thriller'], status: 'finished', rating: 2 }),
    ]
    const s = buildSeeds(books)
    expect(s.map((x) => x.kind)).toEqual(['author', 'genre', 'book'])
    expect(s[0].value).toBe('Madeline Miller'); expect(s[1].value).toBe('Fantasy'); expect(s[2].value).toBe('Circe')
    expect(s[2].query).toBe('books like Circe by Madeline Miller')
  })
  it('hides results she already owns', () => {
    const owned = [book({ title: 'Circe', authors: ['Madeline Miller'] })]
    const res = notInLibrary([
      { title: 'Circe', authors: ['Madeline Miller'], genres: [], identifiers: {}, score: 1, provider: 'google' },
      { title: 'Galatea', authors: ['Madeline Miller'], genres: [], identifiers: {}, score: 1, provider: 'google' },
    ], owned)
    expect(res.map((r) => r.title)).toEqual(['Galatea'])
  })
  it('turns what she types into a search, for any author, genre/mood or book', () => {
    expect(makeSeed('genre', '  spicy   fantasy ', 'x')).toMatchObject({ kind: 'genre', value: 'spicy fantasy', title: 'More “spicy fantasy”', query: 'best spicy fantasy books' })
    expect(makeSeed('author', 'Sarah J. Maas', 'x')!.query).toBe('Sarah J. Maas books')
    expect(makeSeed('book', 'A Court of Thorns and Roses', 'x')!.query).toBe('books like A Court of Thorns and Roses')
    expect(makeSeed('genre', ' a ', 'x')).toBeNull() // too short to search
  })
  it('makes safe search links', () => {
    const l = searchLinks('books like Circe & more')
    expect(l[0].url).toBe('https://www.google.com/search?q=books%20like%20Circe%20%26%20more')
    expect(l.every((x) => x.url.startsWith('https://'))).toBe(true)
  })
})
