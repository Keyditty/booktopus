import type { Candidate, Format, ReadingStatus, SourceName } from '../types'
import { commitImport, planImport } from './store'
import { db } from './db'

type S = [string, string, string, Format, SourceName, ReadingStatus | 'want' | 'fav', string, string?, string?]
// title, author, isbn, format, source, status, genre, narrator, series
const SAMPLE: S[] = [
  ['Project Hail Mary', 'Andy Weir', '9780593135204', 'audiobook', 'audible', 'finished', 'Science Fiction', 'Ray Porter'],
  ['The Midnight Library', 'Matt Haig', '9780525559474', 'ebook', 'libby', 'in_progress', 'Fiction'],
  ['Educated', 'Tara Westover', '9780399590504', 'audiobook', 'libby', 'finished', 'Memoir', 'Julia Whelan'],
  ['Where the Crawdads Sing', 'Delia Owens', '9780735219090', 'audiobook', 'audible', 'fav', 'Fiction', 'Cassandra Campbell'],
  ['Atomic Habits', 'James Clear', '9780735211292', 'audiobook', 'hoopla', 'want', 'Self-Help', 'James Clear'],
  ['The Seven Husbands of Evelyn Hugo', 'Taylor Jenkins Reid', '9781501161933', 'ebook', 'libby', 'fav', 'Historical Fiction'],
  ['Circe', 'Madeline Miller', '9780316556347', 'audiobook', 'audible', 'finished', 'Fantasy', 'Perdita Weeks'],
  ['Dune', 'Frank Herbert', '9780441013593', 'audiobook', 'audible', 'dnf', 'Science Fiction', 'Scott Brick', 'Dune'],
  ['The Hobbit', 'J.R.R. Tolkien', '9780547928227', 'audiobook', 'hoopla', 'want', 'Fantasy', 'Rob Inglis'],
  ['Pride and Prejudice', 'Jane Austen', '9780141439518', 'ebook', 'libby', 'finished', 'Classics'],
  ['Becoming', 'Michelle Obama', '9781524763138', 'audiobook', 'libby', 'finished', 'Memoir', 'Michelle Obama'],
  ['The Alchemist', 'Paulo Coelho', '9780062315007', 'ebook', 'hoopla', 'want', 'Fiction'],
  ['Gone Girl', 'Gillian Flynn', '9780307588371', 'audiobook', 'audible', 'finished', 'Thriller', 'Julia Whelan'],
  ['Little Fires Everywhere', 'Celeste Ng', '9780735224292', 'ebook', 'libby', 'in_progress', 'Fiction'],
  ['The Silent Patient', 'Alex Michaelides', '9781250301697', 'audiobook', 'audible', 'finished', 'Thriller', 'Jack Hawkins'],
  ['Station Eleven', 'Emily St. John Mandel', '9780804172448', 'ebook', 'libby', 'want', 'Science Fiction'],
]

export async function loadSampleBooks() {
  const cands: Candidate[] = SAMPLE.map(([title, author, isbn, format, source, st, genre, narrator, series], i) => ({
    title, authors: [author], narrator, series, format, source, identifiers: { isbn }, genres: [genre],
    coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
    activity: source === 'audible' ? 'purchased' : 'borrowed', events: [],
    status: st === 'want' || st === 'fav' ? undefined : st, wantToRead: st === 'want', favorite: st === 'fav' || title === 'Project Hail Mary',
    rating: st === 'finished' || st === 'fav' ? 4 + (i % 2) : undefined,
    finishedAt: st === 'finished' ? `2025-${String((i % 11) + 1).padStart(2, '0')}-1${i % 9}` : undefined,
    confidence: 1, provenance: 'Sample data', enriched: 'skipped',
  }))
  // Project Hail Mary also on Libby as an ebook: shows one book with two sources
  cands.push({ ...cands[0], source: 'libby', format: 'ebook', activity: 'returned', status: undefined, favorite: false, events: [{ type: 'borrowed', date: '2025-02-01' }, { type: 'returned', date: '2025-02-20' }] })
  const items = planImport(cands, await db.books.toArray()).map((i) => ({ ...i, include: true }))
  return commitImport(items, { adapter: 'sample', label: 'Sample books' })
}
