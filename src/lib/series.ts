import { db } from './db'
import { getSettings } from './settings'
import { normTitle, similarity } from './normalize'
import { dedupeSeriesBooks } from './seriesTracker'

/**
 * "Every book in a series" lookups. Two optional sources:
 *  - Hardcover (GraphQL, needs the user's free personal token)
 *  - Inventaire (open data, no key)
 * EXPERIMENTAL: both were written from public documentation and web-search summaries and have NOT been run against the live services
 * (the build sandbox can't reach them). Every step is defensive and the Settings screen has "Test connection" buttons so problems show up
 * as readable messages instead of silently failing.
 */
export interface SeriesBook { position?: number; title: string; authors: string[]; coverUrl?: string; year?: number }
export interface SeriesResult { name: string; provider: 'hardcover' | 'inventaire'; books: SeriesBook[] }
export interface SeriesQuery { title: string; author?: string; series?: string }
export interface FindSeriesOutcome { result: SeriesResult | null; notes: string[] }

async function fetchJson(url: string, init?: RequestInit, ms = 12000): Promise<any> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal })
    if (!r.ok) {
      let why = ''
      try { const j = await r.json(); why = String(j?.errors?.[0]?.message ?? j?.error ?? j?.message ?? '') } catch { /* no body */ }
      throw new Error(why ? why : r.status === 401 || r.status === 403 ? `HTTP ${r.status}: not allowed (check your token)` : `HTTP ${r.status}`)
    }
    return await r.json()
  } catch (e) {
    const m = (e as Error).message
    throw new Error(/abort/i.test(m) ? 'timed out' : /failed to fetch|networkerror|load failed/i.test(m) ? 'blocked or offline (the site may not allow requests from a web page)' : m)
  } finally { clearTimeout(t) }
}

/* ---------------- Hardcover ---------------- */
const HC_URL = 'https://api.hardcover.app/v1/graphql'
/**
 * Pasted tokens often arrive damaged, especially from a phone: line breaks, spaces, invisible characters, wrapping quotes, or the "Bearer " word.
 * Strip all of that so the token that is sent is exactly the token that was copied.
 */
export function cleanToken(raw: string): string {
  return raw.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/^bearer\s+/i, '').replace(/\s+/g, '')
}
const bearer = (token: string) => `Bearer ${cleanToken(token)}`

/** Turn Hardcover's terse error codes into something a reader can act on (the raw text is kept in brackets for troubleshooting). */
export function friendlyHardcoverError(msg: string): string {
  if (/insufficient_scope/i.test(msg)) return `Hardcover accepted this token but says it isn’t allowed to read this data. Make a fresh token at hardcover.app/account/api and paste the whole thing again (${msg})`
  if (/invalid|jwt|unauthor|401|expired|malformed/i.test(msg)) return `Hardcover didn’t accept this token. Check that all of it was pasted (no gaps), or make a new one at hardcover.app/account/api (${msg})`
  return msg
}

async function hcQuery(token: string, query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const d = await fetchJson(HC_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: bearer(token) }, body: JSON.stringify({ query, variables }) })
  if (d.errors?.length) throw new Error(String(d.errors[0].message ?? 'GraphQL error'))
  return d.data
}

/** Hardcover blocks fuzzy operators like _ilike ("not permitted on this server"), so we only use exact matches (_eq) and its own search. */
const SERIES_FULL = `query($n:String!){ series(where:{name:{_eq:$n}}, limit:3){ id name books_count book_series(order_by:{position:asc}){ position book{ title release_year cached_image cached_contributors } } } }`
const SERIES_BY_ID = `query($id:Int!){ series(where:{id:{_eq:$id}}, limit:1){ id name books_count book_series(order_by:{position:asc}){ position book{ title release_year cached_image cached_contributors } } } }`
const SERIES_MIN = `query($n:String!){ series(where:{name:{_eq:$n}}, limit:3){ id name book_series{ position book{ title } } } }`

function mapHardcoverSeries(rows: any[], wanted: string): SeriesResult | null {
  if (!rows?.length) return null
  const best = rows.find((r) => normTitle(r.name) === normTitle(wanted)) ?? rows.sort((a, b) => (b.books_count ?? 0) - (a.books_count ?? 0))[0]
  const books: SeriesBook[] = (best.book_series ?? []).filter((x: any) => x?.book?.title).map((x: any) => ({
    position: typeof x.position === 'number' ? x.position : undefined, title: x.book.title, year: x.book.release_year ?? undefined,
    coverUrl: x.book.cached_image?.url, authors: (Array.isArray(x.book.cached_contributors) ? x.book.cached_contributors : []).map((c: any) => c?.author?.name).filter(Boolean),
  })).sort((a: SeriesBook, b: SeriesBook) => (a.position ?? 1e9) - (b.position ?? 1e9))
  const unique = dedupeSeriesBooks(books)
  return unique.length ? { name: best.name, provider: 'hardcover', books: unique } : null
}

async function hcSeriesByExactName(token: string, name: string): Promise<SeriesResult | null> {
  try { return mapHardcoverSeries((await hcQuery(token, SERIES_FULL, { n: name }))?.series ?? [], name) }
  catch (e) {
    // if a field in the rich query isn't allowed, retry with the smallest possible query so we still get titles in order
    if (/not permitted|cannot query field|not found in type|validation/i.test((e as Error).message)) return mapHardcoverSeries((await hcQuery(token, SERIES_MIN, { n: name }))?.series ?? [], name)
    throw e
  }
}

export async function hardcoverSeries(q: SeriesQuery, token: string): Promise<SeriesResult | null> {
  const names: string[] = []
  if (q.series?.trim()) names.push(q.series.trim())
  // Hardcover's own book search tells us the exact series name(s) it uses
  const bookHits = async () => {
    const d = await hcQuery(token, 'query($q:String!){ search(query:$q, query_type:"Book", per_page:5){ results } }', { q: `${q.title} ${q.author ?? ''}`.trim() })
    const hits: any[] = d?.search?.results?.hits ?? []
    for (const h of hits) for (const n of h?.document?.series_names ?? []) if (n && !names.includes(n)) names.push(n)
  }
  for (const n of names.slice()) { const r = await hcSeriesByExactName(token, n); if (r) return r }
  await bookHits()
  for (const n of names) { const r = await hcSeriesByExactName(token, n); if (r) return r }
  // last resort: Hardcover's series search, then fetch by id
  try {
    const d = await hcQuery(token, 'query($q:String!){ search(query:$q, query_type:"Series", per_page:3){ results } }', { q: q.series?.trim() || q.title })
    const doc = (d?.search?.results?.hits ?? [])[0]?.document
    const id = parseInt(doc?.id)
    if (Number.isFinite(id)) return mapHardcoverSeries((await hcQuery(token, SERIES_BY_ID, { id }))?.series ?? [], doc?.name ?? q.title)
  } catch { /* fall through */ }
  return null
}

/* ---------------- Inventaire ---------------- */
const INV = 'https://inventaire.io/api'
const invLabel = (e: any, lang = 'en') => e?.labels?.[lang] ?? e?.labels?.en ?? Object.values(e?.labels ?? {})[0] ?? ''

export async function inventaireSeries(q: SeriesQuery): Promise<SeriesResult | null> {
  let seriesUri: string | undefined, seriesName = q.series?.trim()
  if (seriesName) {
    const d = await fetchJson(`${INV}/search?search=${encodeURIComponent(seriesName)}&types=series&limit=5&lang=en`)
    const rs: any[] = d?.results ?? []
    const best = rs.map((r) => ({ r, s: similarity(normTitle(r.label ?? ''), normTitle(seriesName!)) })).sort((a, b) => b.s - a.s)[0]
    if (best && best.s >= 0.6) { seriesUri = best.r.uri ?? (best.r.id ? `wd:${best.r.id}` : undefined); seriesName = best.r.label ?? seriesName }
  }
  if (!seriesUri) {
    // find the work, then read its "part of the series" claim (wdt:P179)
    const d = await fetchJson(`${INV}/search?search=${encodeURIComponent(`${q.title} ${q.author ?? ''}`.trim())}&types=works&limit=5&lang=en`)
    const work = (d?.results ?? []).find((r: any) => similarity(normTitle(r.label ?? ''), normTitle(q.title)) >= 0.7)
    if (!work) return null
    const uri = work.uri ?? (work.id ? `wd:${work.id}` : undefined)
    if (!uri) return null
    const ents = await fetchJson(`${INV}/entities?action=by-uris&uris=${encodeURIComponent(uri)}`)
    const e = ents?.entities?.[uri]
    const claim = e?.claims?.['wdt:P179']?.[0]
    if (!claim) return null
    seriesUri = String(claim)
    // the work only tells us the series' address; fetch its label so the series gets its real name
    try {
      const se = await fetchJson(`${INV}/entities?action=by-uris&uris=${encodeURIComponent(seriesUri)}`)
      seriesName = invLabel(se?.entities?.[seriesUri]) || undefined
    } catch { /* keep going; we'll fall back to a generic name */ }
  }
  const parts = await fetchJson(`${INV}/entities?action=series-parts&uri=${encodeURIComponent(seriesUri)}`)
  const list: any[] = parts?.parts ?? []
  if (!list.length) return null
  const uris = list.map((p) => p.uri).filter(Boolean) as string[]
  const ents = await fetchJson(`${INV}/entities?action=by-uris&uris=${encodeURIComponent(uris.join('|'))}`)
  const books: SeriesBook[] = list.map((p) => {
    const e = ents?.entities?.[p.uri]
    const ord = parseFloat(p.ordinal ?? e?.claims?.['wdt:P1545']?.[0])
    return { position: Number.isFinite(ord) ? ord : undefined, title: invLabel(e) || String(p.uri), authors: [], year: undefined, coverUrl: e?.image?.url ? (String(e.image.url).startsWith('http') ? e.image.url : `https://inventaire.io${e.image.url}`) : undefined }
  }).filter((b) => b.title && !b.title.startsWith('wd:') && !b.title.startsWith('inv:'))
    .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
  const unique = dedupeSeriesBooks(books)
  return unique.length ? { name: seriesName ?? q.series ?? `${q.title} series`, provider: 'inventaire', books: unique } : null
}

/* ---------------- cache (so the tracker doesn't hit the network every time) ---------------- */
const seriesKey = (name: string) => `series:${normTitle(name).replace(/\b(series|trilogy|saga|chronicles)\b/g, '').replace(/\s+/g, ' ').trim()}`
export async function cachedSeries(name: string): Promise<SeriesResult | null> {
  const row = await db.cache.get(seriesKey(name))
  return row && Date.now() - row.at < 30 * 86400_000 ? (row.value as SeriesResult) : null
}
export async function cacheSeries(result: SeriesResult, alsoAs: string[] = []) {
  for (const n of [result.name, ...alsoAs]) if (n) await db.cache.put({ key: seriesKey(n), value: result, at: Date.now() })
}

/** Try Hardcover first (if a token is saved), then Inventaire. Returns readable notes about what happened. */
export async function findSeries(q: SeriesQuery): Promise<FindSeriesOutcome> {
  const notes: string[] = []
  if (q.series?.trim()) { const hit = await cachedSeries(q.series); if (hit) return { result: hit, notes } } // saved earlier: no network needed
  const token = getSettings().hardcoverToken
  if (token) {
    try { const r = await hardcoverSeries(q, token); if (r) { await cacheSeries(r, [q.series ?? '']); return { result: r, notes } }; notes.push('Hardcover had no series for this book.') }
    catch (e) { notes.push(`Hardcover: ${friendlyHardcoverError((e as Error).message)}.`) }
  }
  try { const r = await inventaireSeries(q); if (r) { await cacheSeries(r, [q.series ?? '']); return { result: r, notes } }; notes.push('Inventaire had no series for this book.') }
  catch (e) { notes.push(`Inventaire: ${(e as Error).message}.`) }
  return { result: null, notes }
}

/* ---------------- connection tests (Settings) ---------------- */
export interface TestOutcome { ok: boolean; message: string; ms: number }
export async function testHardcover(token: string): Promise<TestOutcome> {
  const t0 = Date.now()
  const clean = cleanToken(token)
  if (!clean) return { ok: false, message: 'Paste your Hardcover token first.', ms: 0 }
  try {
    // test what the app actually needs (reading book/series data), not account details, which some tokens aren't allowed to read
    await hcQuery(token, 'query { series(limit: 1, where: { name: { _eq: "Dune" } }) { id name } }')
    let who = ''
    try { const d = await hcQuery(token, 'query { me { username } }'); const me = Array.isArray(d?.me) ? d.me[0] : d?.me; if (me?.username) who = ` as ${me.username}` } catch { /* account details are optional */ }
    return { ok: true, message: `Connected${who}. Series lookups will use Hardcover. (token length ${clean.length})`, ms: Date.now() - t0 }
  } catch (e) { return { ok: false, message: `${friendlyHardcoverError((e as Error).message)} (token length ${clean.length})`, ms: Date.now() - t0 } }
}
export async function testInventaire(): Promise<TestOutcome> {
  const t0 = Date.now()
  try {
    const d = await fetchJson(`${INV}/search?search=dune&types=series&limit=3&lang=en`)
    const n = (d?.results ?? []).length
    return { ok: n > 0, message: n > 0 ? `Connected. Found ${n} series for “dune”.` : 'Reached Inventaire, but the search returned nothing.', ms: Date.now() - t0 }
  } catch (e) { return { ok: false, message: (e as Error).message, ms: Date.now() - t0 } }
}
