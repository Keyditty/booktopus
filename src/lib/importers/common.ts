import type { Candidate, Format, ReadingStatus, SourceName } from '../../types'
import { normIsbn, parseDate, splitAuthors, splitTitle } from '../normalize'

export function statusFromText(raw: string): { status?: ReadingStatus; wantToRead?: boolean } {
  const s = raw.toLowerCase().trim()
  if (!s) return {}
  if (/(did not finish|didn'?t finish|dnf|abandon|gave up|stopped|quit)/.test(s)) return { status: 'dnf' }
  if (/(want to|to[- ]read|tbr|wishlist|wish list|to listen|up next|queue|plan to)/.test(s)) return { wantToRead: true }
  if (/(currently|reading|listening|in progress|in-progress|started|now)/.test(s)) return { status: 'in_progress' }
  if (/(not started|unread|unstarted)/.test(s)) return { status: 'not_started' }
  if (/(finished|completed|\bread\b|\bdone\b|listened|✅|✔)/.test(s)) return { status: 'finished' }
  return {}
}

export function formatFromText(raw: string): Format {
  const s = raw.toLowerCase()
  if (/(audio|listen|narrat|mp3)/.test(s)) return 'audiobook'
  if (/(ebook|e-book|kindle|epub|digital)/.test(s)) return 'ebook'
  if (/(comic|graphic|manga)/.test(s)) return 'comic'
  if (/(print|paperback|hardcover|physical)/.test(s)) return 'print'
  return 'unknown'
}

export function sourceFromText(raw: string, fallback: SourceName): SourceName {
  const s = raw.toLowerCase()
  if (s.includes('audible')) return 'audible'
  if (s.includes('libby') || s.includes('overdrive')) return 'libby'
  if (s.includes('hoopla')) return 'hoopla'
  return fallback
}

export function makeCandidate(p: Partial<Candidate> & { title: string; source: SourceName; provenance: string }): Candidate {
  const split = splitTitle(p.title)
  return {
    authors: [], format: 'unknown', identifiers: {}, activity: 'unknown', events: [], confidence: 0.8,
    ...p,
    title: split.title,
    subtitle: p.subtitle ?? split.subtitle,
    series: p.series ?? split.series,
    seriesNumber: p.seriesNumber ?? split.seriesNumber,
  }
}

export function ratingFrom(raw: string): number | undefined {
  const m = raw.match(/(\d(?:\.\d)?)\s*(?:\/\s*5|stars?)?/)
  const stars = (raw.match(/[⭐★]/g) || []).length
  if (stars) return Math.min(5, stars)
  if (m) { const n = Math.round(parseFloat(m[1])); if (n >= 1 && n <= 5) return n }
  return undefined
}

/** Map a generic table row (header names already lowercased) to a Candidate. Used for CSV/JSON/markdown tables. */
export function rowToCandidate(o: Record<string, string>, defaults: { source: SourceName; provenance: string }): Candidate | null {
  const g = (...n: string[]) => { for (const k of n) if (o[k]) return o[k]; return '' }
  const title = g('title', 'book title', 'book', 'name', 'book name', 'audiobook', 'product title')
  if (!title) return null
  const statusRaw = g('status', 'reading status', 'exclusive shelf', 'shelf', 'state', 'listening status', 'progress')
  const st = statusFromText(statusRaw)
  const isbn = normIsbn(g('isbn13', 'isbn', 'isbn 13', 'isbn10', 'isbn 10').replace(/[="]/g, ''))
  const fmtRaw = g('format', 'type', 'media', 'media type', 'edition')
  const rating = g('my rating', 'rating', 'stars')
  const asin = g('asin', 'audible asin')
  const source = sourceFromText(g('source', 'service', 'platform', 'app'), defaults.source)
  const finished = parseDate(g('date finished', 'finished', 'date read', 'finished on', 'completed', 'date completed'))
  return makeCandidate({
    title, source, provenance: defaults.provenance,
    authors: splitAuthors(g('author', 'authors', 'by', 'author l-f', 'creator')),
    narrator: g('narrator', 'narrators', 'read by', 'narrated by') || undefined,
    series: g('series', 'series name') || undefined,
    seriesNumber: parseFloat(g('series number', 'series position', 'book number', 'series sequence')) || undefined,
    format: formatFromText(fmtRaw || (asin ? 'audiobook' : '')),
    identifiers: { isbn, asin: asin || undefined },
    sourceId: asin || undefined,
    status: st.status, wantToRead: st.wantToRead,
    rating: rating ? ratingFrom(rating) : undefined,
    notes: g('notes', 'my review', 'review', 'comments') || undefined,
    startedAt: parseDate(g('date started', 'started', 'date started reading', 'started on')),
    finishedAt: finished,
    genres: g('genre', 'genres', 'categories') ? g('genre', 'genres', 'categories').split(/[;,|]/).map((x) => x.trim()).filter(Boolean) : undefined,
    favorite: /^(1|true|yes|y|♥|❤️?)$/i.test(g('favorite', 'favourite', 'favorites')) || undefined,
    confidence: 0.95,
  })
}
