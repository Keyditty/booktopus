import { db } from './db'
import { bestMatch, POSSIBLE } from './match'
import { commitImport, planOne } from './store'
import type { Meta } from './metadata'
import type { Book, Candidate } from '../types'

/** Ordinary public search pages. They open in a new tab; nothing about the reader is sent except the words in the query. */
export const searchLinks = (q: string) => [
  { id: 'google', label: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'goodreads', label: 'Goodreads', url: `https://www.goodreads.com/search?q=${encodeURIComponent(q)}` },
  { id: 'storygraph', label: 'StoryGraph', url: `https://app.thestorygraph.com/browse?search_term=${encodeURIComponent(q)}` },
  { id: 'audible', label: 'Audible', url: `https://www.audible.com/search?keywords=${encodeURIComponent(q)}` },
]
export const googleUrl = (q: string) => searchLinks(q)[0].url

export interface Seed { id: string; kind: 'author' | 'genre' | 'book'; title: string; value: string; query: string }

/** Choose what to explore from the library: favourite author, favourite genre, and a book she loved. */
export function buildSeeds(books: Book[]): Seed[] {
  const done = books.filter((b) => b.status === 'finished' || b.readings.length)
  const pool = done.length ? done : books
  const w = (b: Book) => 1 + (b.favorite ? 2 : 0) + ((b.rating ?? 0) >= 4 ? 1 : 0)
  const tally = (pick: (b: Book) => string[]) => { const m = new Map<string, number>(); for (const b of pool) for (const k of pick(b)) m.set(k, (m.get(k) ?? 0) + w(b)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] }
  const seeds: Seed[] = []
  const author = tally((b) => b.authors)
  if (author) seeds.push({ id: 'a', kind: 'author', title: `More by ${author}`, value: author, query: `${author} books` })
  const genre = tally((b) => b.genres)
  if (genre) seeds.push({ id: 'g', kind: 'genre', title: `More ${genre}`, value: genre, query: `best ${genre} books` })
  const loved = [...pool].sort((a, b) => w(b) - w(a) || (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0]
  if (loved) seeds.push({ id: 'b', kind: 'book', title: `Books like “${loved.title}”`, value: loved.title, query: `books like ${loved.title}${loved.authors[0] ? ' by ' + loved.authors[0] : ''}` })
  return seeds
}

/** Drop results she already has on her shelf. */
export function notInLibrary(results: Meta[], books: Book[]): Meta[] {
  return results.filter((m) => { const hit = bestMatch({ title: m.title, authors: m.authors, identifiers: m.identifiers }, books); return !hit || hit.score < POSSIBLE })
}

/** One tap: add a discovered book, either to Want to Read or simply "I have it". */
export async function addMeta(m: Meta, opts: { want: boolean; source?: 'manual' }) {
  const c: Candidate = {
    title: m.title, subtitle: m.subtitle, authors: m.authors, format: 'unknown', source: opts.source ?? 'manual', identifiers: m.identifiers, activity: 'unknown', events: [],
    wantToRead: opts.want || undefined, coverUrl: m.coverUrl, synopsis: m.synopsis, year: m.year, genres: m.genres, confidence: 1, provenance: 'Found by searching', enriched: 'matched',
  }
  const item = planOne(c, await db.books.toArray())
  return commitImport([{ ...item, include: true, category: item.matchBookId ? item.category : 'new' }], { adapter: 'discover', label: `Added “${m.title}”${opts.want ? ' to Want to Read' : ''}` })
}
export const addToWantList = (m: Meta) => addMeta(m, { want: true })
