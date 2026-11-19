import { db } from './db'
import { getSettings } from './settings'
import { bookKeyOf, normIsbn, normTitle, authorsCompatible, splitAuthors, titleSimilarity } from './normalize'
import type { Candidate, Identifiers } from '../types'

export interface Meta {
  title: string; subtitle?: string; authors: string[]; synopsis?: string; year?: number; genres: string[]
  coverUrl?: string; identifiers: Identifiers; score: number; provider: 'google' | 'openlibrary'
}

async function getJson(url: string, ms = 9000): Promise<any> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

const httpsCover = (u?: string) => u?.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=1')

function fromGoogle(v: any, target: { title: string; authors: string[] }): Meta | null {
  const i = v?.volumeInfo
  if (!i?.title) return null
  const authors: string[] = (i.authors ?? []).flatMap((a: string) => splitAuthors(a))
  const ids = (i.industryIdentifiers ?? []) as { type: string; identifier: string }[]
  const isbn = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? ids.find((x) => x.type === 'ISBN_10')?.identifier
  return {
    title: i.title, subtitle: i.subtitle, authors, synopsis: i.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    year: parseInt(i.publishedDate) || undefined, genres: (i.categories ?? []).flatMap((c: string) => c.split(/\s*\/\s*/)).slice(0, 4),
    coverUrl: httpsCover(i.imageLinks?.thumbnail ?? i.imageLinks?.smallThumbnail),
    identifiers: { isbn: normIsbn(isbn), gbId: v.id }, provider: 'google', score: scoreResult(target, i.title, authors),
  }
}

function fromOpenLibrary(d: any, target: { title: string; authors: string[] }): Meta | null {
  if (!d?.title) return null
  const authors: string[] = d.author_name ?? []
  return {
    title: d.title, subtitle: d.subtitle, authors, year: d.first_publish_year, genres: (d.subject ?? []).slice(0, 4),
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
    identifiers: { isbn: normIsbn((d.isbn ?? [])[0]), olId: d.key }, provider: 'openlibrary', score: scoreResult(target, d.title, authors),
  }
}

export function scoreResult(target: { title: string; authors: string[] }, title: string, authors: string[]): number {
  const t = titleSimilarity(target.title, title)
  const a = authorsCompatible(target.authors, authors)
  if (t < 0.6) return t * 0.5
  if (a === false) return Math.min(t, 0.5)
  return a === true ? 0.5 + t * 0.5 : t * 0.8
}

export async function lookupMeta(c: Pick<Candidate, 'title' | 'authors' | 'identifiers'>): Promise<Meta | null> {
  const isbn = normIsbn(c.identifiers.isbn)
  const cacheKey = `meta:${isbn ?? bookKeyOf(c.title, c.authors)}`
  const cached = await db.cache.get(cacheKey)
  if (cached && Date.now() - cached.at < 30 * 86400_000) return cached.value as Meta | null

  const target = { title: c.title, authors: c.authors }
  const key = getSettings().googleKey
  let best: Meta | null = null
  const consider = (m: Meta | null) => { if (m && (!best || m.score > best.score)) best = m }

  try {
    const q = isbn ? `isbn:${isbn}` : `intitle:${c.title}${c.authors[0] ? ` inauthor:${c.authors[0]}` : ''}`
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=5&printType=books&q=${encodeURIComponent(q)}${key ? `&key=${encodeURIComponent(key)}` : ''}`)
    for (const v of d.items ?? []) consider(fromGoogle(v, target))
  } catch { /* quota / offline: fall through to Open Library */ }

  if (!best || (best as Meta).score < 0.85 || !(best as Meta).coverUrl) {
    try {
      const qs = isbn ? `isbn=${isbn}` : `title=${encodeURIComponent(c.title)}${c.authors[0] ? `&author=${encodeURIComponent(c.authors[0])}` : ''}`
      const d = await getJson(`https://openlibrary.org/search.json?${qs}&limit=5&fields=key,title,subtitle,author_name,first_publish_year,cover_i,isbn,subject`)
      for (const x of d.docs ?? []) {
        const m = fromOpenLibrary(x, target)
        if (m && best && m.score >= (best as Meta).score - 0.1 && !(best as Meta).coverUrl && m.coverUrl) { (best as Meta).coverUrl = m.coverUrl; (best as Meta).identifiers.olId = m.identifiers.olId }
        else consider(m)
      }
    } catch { /* offline */ }
  }
  const result = best && (best as Meta).score >= 0.6 ? (best as Meta) : null
  // only cache a definite answer; an offline failure must not poison the cache
  if (result || best) await db.cache.put({ key: cacheKey, value: result, at: Date.now() })
  return result
}

/** Enrich candidates in place with covers/synopsis/ids. Concurrency-limited to respect provider rate limits. */
export async function enrichCandidates(cands: Candidate[], onProgress?: (done: number, total: number) => void, concurrency = 3): Promise<void> {
  let next = 0, done = 0
  const work = async () => {
    while (next < cands.length) {
      const c = cands[next++]
      try {
        if (!getSettings().lookupOnline) { c.enriched = 'skipped' }
        else {
          const m = await lookupMeta(c)
          applyMeta(c, m)
        }
      } catch { c.enriched = 'unmatched' }
      onProgress?.(++done, cands.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cands.length) }, work))
}

export function applyMeta(c: Candidate, m: Meta | null) {
  if (!m) { c.enriched = 'unmatched'; return }
  c.enriched = 'matched'
  c.enrichScore = m.score
  // Only adopt the provider's spelling when confident; keep the imported record's own facts otherwise.
  if (m.score >= 0.85) {
    if (normTitle(m.title) === normTitle(c.title) || c.confidence < 0.9) { c.title = m.title; if (m.subtitle) c.subtitle = m.subtitle }
    if (!c.authors.length || c.confidence < 0.9) c.authors = m.authors.length ? m.authors : c.authors
    c.confidence = Math.max(c.confidence, Math.min(0.95, m.score))
  } else {
    c.confidence = Math.min(c.confidence, 0.6)
  }
  c.coverUrl = c.coverUrl ?? m.coverUrl
  c.synopsis = c.synopsis ?? m.synopsis
  c.year = c.year ?? m.year
  c.genres = c.genres?.length ? c.genres : m.genres
  c.identifiers = { ...m.identifiers, ...c.identifiers, gbId: c.identifiers.gbId ?? m.identifiers.gbId, olId: c.identifiers.olId ?? m.identifiers.olId }
}

/** Free-text search for the "add a book by hand" form: returns a few likely matches to pick from. */
export async function searchBooks(query: string, limit = 6): Promise<Meta[]> {
  const q = query.trim()
  const isbn = normIsbn(q)
  if (q.length < 3 || !getSettings().lookupOnline) return []
  const target = { title: q, authors: [] as string[] }
  const out: Meta[] = []
  const key = getSettings().googleKey
  try {
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=${Math.min(40, limit)}&printType=books&q=${encodeURIComponent(isbn ? `isbn:${isbn}` : q)}${key ? `&key=${encodeURIComponent(key)}` : ''}`)
    for (const v of d.items ?? []) { const m = fromGoogle(v, target); if (m) out.push(m) }
  } catch { /* quota or offline */ }
  if (out.length < 3) {
    try {
      const d = await getJson(`https://openlibrary.org/search.json?${isbn ? `isbn=${isbn}` : `q=${encodeURIComponent(q)}`}&limit=${limit}&fields=key,title,subtitle,author_name,first_publish_year,cover_i,isbn,subject`)
      for (const x of d.docs ?? []) { const m = fromOpenLibrary(x, target); if (m) out.push(m) }
    } catch { /* offline */ }
  }
  const seen = new Set<string>()
  return out.filter((m) => { const k = bookKeyOf(m.title, m.authors); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, limit)
}

/** Find books by an author or in a genre, for the "Find more" ideas. Needs internet; returns [] offline. */
export async function discoverBooks(kind: 'author' | 'genre', value: string): Promise<Meta[]> {
  if (!getSettings().lookupOnline) return []
  const key = getSettings().googleKey
  const target = { title: value, authors: kind === 'author' ? [value] : [] }
  const out: Meta[] = []
  try {
    const q = kind === 'author' ? `inauthor:"${value}"` : `subject:"${value}"`
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=16&printType=books&langRestrict=en&q=${encodeURIComponent(q)}${key ? `&key=${encodeURIComponent(key)}` : ''}`)
    for (const v of d.items ?? []) { const m = fromGoogle(v, target); if (m) out.push(m) }
  } catch { /* quota or offline */ }
  if (out.length < 5) {
    try {
      const qs = kind === 'author' ? `author=${encodeURIComponent(value)}` : `subject=${encodeURIComponent(value.toLowerCase())}`
      const d = await getJson(`https://openlibrary.org/search.json?${qs}&limit=16&fields=key,title,subtitle,author_name,first_publish_year,cover_i,isbn,subject`)
      for (const x of d.docs ?? []) { const m = fromOpenLibrary(x, target); if (m) out.push(m) }
    } catch { /* offline */ }
  }
  const seen = new Set<string>()
  return out.filter((m) => { const k = bookKeyOf(m.title, m.authors); if (seen.has(k)) return false; seen.add(k); return true })
}
