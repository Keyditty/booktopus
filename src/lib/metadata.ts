import { db } from './db'
import { getSettings } from './settings'
import { bookKeyOf, normIsbn, normTitle, authorsCompatible, similarity, splitAuthors, titleSimilarity } from './normalize'
import type { Candidate, Identifiers } from '../types'

export interface Meta {
  title: string; subtitle?: string; authors: string[]; synopsis?: string; year?: number; genres: string[]
  coverUrl?: string; identifiers: Identifiers; score: number; provider: 'google' | 'openlibrary'
  /** how widely known the book is (ratings or editions); used to rank famous books above obscure namesakes */
  popularity?: number
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
    identifiers: { isbn: normIsbn(isbn), gbId: v.id }, provider: 'google', score: scoreResult(target, i.title, authors), popularity: typeof i.ratingsCount === 'number' ? i.ratingsCount : undefined,
  }
}

function fromOpenLibrary(d: any, target: { title: string; authors: string[] }): Meta | null {
  if (!d?.title) return null
  const authors: string[] = d.author_name ?? []
  return {
    title: d.title, subtitle: d.subtitle, authors, year: d.first_publish_year, genres: (d.subject ?? []).slice(0, 4),
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
    identifiers: { isbn: normIsbn((d.isbn ?? [])[0]), olId: d.key }, provider: 'openlibrary', score: scoreResult(target, d.title, authors), popularity: typeof d.ratings_count === 'number' ? d.ratings_count : typeof d.edition_count === 'number' ? d.edition_count : undefined,
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
      const d = await getJson(`https://openlibrary.org/search.json?${qs}&limit=5&fields=key,title,subtitle,author_name,first_publish_year,cover_i,isbn,subject,ratings_count,edition_count`)
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

/* ------------------------------ searching for any book ------------------------------ */
export type FindMode = 'all' | 'title' | 'author'

const NAME_VARIANTS: string[][] = [['steven', 'stephen'], ['john', 'jon'], ['sara', 'sarah'], ['catherine', 'katherine', 'kathryn', 'katharine', 'cathryn'], ['jeffrey', 'geoffrey', 'jeffery'],
  ['philip', 'phillip'], ['eric', 'erik'], ['brian', 'bryan'], ['michael', 'micheal'], ['alan', 'allan', 'allen'], ['ann', 'anne'], ['neil', 'neal'], ['christopher', 'kristopher'],
  ['megan', 'meghan'], ['lauren', 'loren'], ['rebecca', 'rebekah'], ['isaac', 'issac'], ['jennifer', 'jenifer'], ['marc', 'mark'], ['sean', 'shawn', 'shaun']]
const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'to', 'for', 'on', 'at', 'with', 'by'])

/** Does this look like a person's name ("stephen king", "J. K. Rowling") rather than a title? */
export function looksLikeName(q: string): boolean {
  const words = q.trim().split(/\s+/)
  return words.length >= 2 && words.length <= 4 && /^[\p{L}'.\-\s]+$/u.test(q) && words.every((w) => w.replace(/\./g, '').length >= 1) && !words.some((w) => STOP.has(w.toLowerCase()))
}

/** Common first-name spellings people mix up ("steven king" also tries "stephen king"). */
export function nameVariants(q: string): string[] {
  const words = q.trim().split(/\s+/)
  const group = NAME_VARIANTS.find((g) => g.includes(words[0].toLowerCase()))
  return group ? group.filter((v) => v !== words[0].toLowerCase()).map((v) => [v[0].toUpperCase() + v.slice(1), ...words.slice(1)].join(' ')) : []
}

const nameKey = (s: string) => normTitle(s).replace(/\b[a-z]\b/g, '').replace(/\s+/g, ' ').trim()

/**
 * Order search results so the books a reader means come first: exact author match, then title match, then how widely known the book is.
 * `targets` are the author spellings that count as a match (what she typed plus common variants).
 */
export function rankResults(results: Meta[], query: string, mode: FindMode, targets: string[] = [query]): Meta[] {
  const tk = targets.map(nameKey)
  const qk = normTitle(query)
  const matches = (m: Meta, t: string) => m.authors.some((a) => { const ak = nameKey(a); return ak === t || (t.length > 5 && similarity(ak, t) >= 0.9) })
  const scored = results.map((m, i) => {
    const exactAuthor = matches(m, tk[0])                        // the spelling she typed
    const variantAuthor = !exactAuthor && tk.slice(1).some((t) => matches(m, t)) // a common alternative spelling (steven/stephen)
    const titleHit = titleSimilarity(m.title, query) >= 0.8 || (qk.length > 2 && normTitle(m.title).includes(qk))
    const pop = Math.log10((m.popularity ?? 0) + 1)
    const score = (exactAuthor ? 4 : variantAuthor ? 3.5 : 0) + (titleHit ? 3 : 0) + pop * 0.5 - i * 0.01 // small tie-break keeps the provider's own order
    return { m, exactAuthor, authorHit: exactAuthor || variantAuthor, titleHit, score }
  })
  let kept = scored
  if (mode === 'author') {
    // exact spelling wins when there is enough of it ("Stephen King" picked from the suggestions); otherwise allow variants
    const exact = scored.filter((x) => x.exactAuthor), any = scored.filter((x) => x.authorHit)
    kept = exact.length >= 2 ? exact : any.length >= 2 ? any : scored
  }
  if (mode === 'title') { const hits = scored.filter((x) => x.titleHit); if (hits.length >= 2) kept = hits }
  return kept.sort((a, b) => b.score - a.score).map((x) => x.m)
}

/** Free-text search for any book: smarter than one keyword query (author lookups with spelling variants, ranking by relevance and fame). */
export async function searchBooks(query: string, limit = 6, mode: FindMode = 'all'): Promise<Meta[]> {
  const q = query.trim()
  const isbn = normIsbn(q)
  if (q.length < 3 || !getSettings().lookupOnline) return []
  const key = getSettings().googleKey
  const target = { title: q, authors: [] as string[] }
  const name = mode === 'author' || (mode === 'all' && looksLikeName(q))
  const variants = name ? nameVariants(q) : []
  const targets = [q, ...variants]
  const google = async (gq: string, n: number) => { try { const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=${Math.min(40, n)}&printType=books&langRestrict=en&q=${encodeURIComponent(gq)}${key ? `&key=${encodeURIComponent(key)}` : ''}`); return (d.items ?? []).map((v: any) => fromGoogle(v, target)).filter(Boolean) as Meta[] } catch { return [] as Meta[] } }
  const openlib = async (qs: string, n: number) => { try { const d = await getJson(`https://openlibrary.org/search.json?${qs}&limit=${n}&fields=key,title,subtitle,author_name,first_publish_year,cover_i,isbn,subject,ratings_count,edition_count`); return (d.docs ?? []).map((x: any) => fromOpenLibrary(x, target)).filter(Boolean) as Meta[] } catch { return [] as Meta[] } }

  const jobs: Promise<Meta[]>[] = []
  if (isbn) { jobs.push(google(`isbn:${isbn}`, limit), openlib(`isbn=${isbn}`, limit)) }
  else if (mode === 'title') { jobs.push(google(`intitle:"${q}"`, 20), openlib(`title=${encodeURIComponent(q)}`, 20)) }
  else if (mode === 'author') { for (const t of targets) jobs.push(google(`inauthor:"${t}"`, 20), openlib(`author=${encodeURIComponent(t)}&sort=editions`, 20)) }
  else {
    jobs.push(google(q, 20), openlib(`q=${encodeURIComponent(q)}`, 20))
    if (name) for (const t of targets) jobs.push(google(`inauthor:"${t}"`, 20), openlib(`author=${encodeURIComponent(t)}&sort=editions`, 20))
  }
  const out = (await Promise.all(jobs)).flat()
  const seen = new Set<string>()
  const unique = out.filter((m) => { const k = bookKeyOf(m.title, m.authors); if (seen.has(k)) return false; seen.add(k); return true })
  return rankResults(unique, q, mode, targets).slice(0, limit)
}

/** "Did you mean…?" for people: well-known authors whose names look like what was typed, most prolific first. */
export async function searchAuthors(query: string): Promise<{ name: string; works: number; topWork?: string }[]> {
  const q = query.trim()
  if (q.length < 3 || !looksLikeName(q) || !getSettings().lookupOnline) return []
  const lists = await Promise.all([q, ...nameVariants(q)].map(async (v) => { try { const d = await getJson(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(v)}&limit=5`); return (d.docs ?? []) as any[] } catch { return [] as any[] } }))
  const seen = new Set<string>()
  return lists.flat().filter((d) => typeof d?.name === 'string').map((d) => ({ name: d.name as string, works: Number(d.work_count) || 0, topWork: typeof d.top_work === 'string' ? d.top_work : undefined }))
    .filter((a) => { const k = a.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => b.works - a.works).slice(0, 4)
}

/** Find books by an author or in a genre, for the "Find more" ideas. Needs internet; returns [] offline. */
export async function discoverBooks(kind: 'author' | 'genre', value: string): Promise<Meta[]> {
  if (!getSettings().lookupOnline) return []
  if (kind === 'author') return searchBooks(value, 16, 'author') // same smart author search as "Find any book" (spelling variants, ranked by fame)
  const key = getSettings().googleKey
  const target = { title: value, authors: [] as string[] }
  const out: Meta[] = []
  try {
    const q = `subject:"${value}"`
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=16&printType=books&langRestrict=en&q=${encodeURIComponent(q)}${key ? `&key=${encodeURIComponent(key)}` : ''}`)
    for (const v of d.items ?? []) { const m = fromGoogle(v, target); if (m) out.push(m) }
  } catch { /* quota or offline */ }
  if (out.length < 5) {
    try {
      const qs = `subject=${encodeURIComponent(value.toLowerCase())}`
      const d = await getJson(`https://openlibrary.org/search.json?${qs}&limit=16&fields=key,title,subtitle,author_name,first_publish_year,cover_i,isbn,subject,ratings_count,edition_count`)
      for (const x of d.docs ?? []) { const m = fromOpenLibrary(x, target); if (m) out.push(m) }
    } catch { /* offline */ }
  }
  if (out.length < 5) {
    // a mood or made-up genre ("spicy fantasy", "romantasy") is rarely an official subject heading: fall back to a plain keyword search
    try {
      const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=16&printType=books&langRestrict=en&orderBy=relevance&q=${encodeURIComponent(value)}${key ? `&key=${encodeURIComponent(key)}` : ''}`)
      for (const v of d.items ?? []) { const m = fromGoogle(v, target); if (m) out.push(m) }
    } catch { /* offline */ }
  }
  const seen = new Set<string>()
  return out.filter((m) => { const k = bookKeyOf(m.title, m.authors); if (seen.has(k)) return false; seen.add(k); return true })
}
