import { getSettings } from './settings'
import { normTitle, similarity } from './normalize'

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
const bearer = (token: string) => (/^bearer\s/i.test(token.trim()) ? token.trim() : `Bearer ${token.trim()}`)

async function hcQuery(token: string, query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const d = await fetchJson(HC_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: bearer(token) }, body: JSON.stringify({ query, variables }) })
  if (d.errors?.length) throw new Error(String(d.errors[0].message ?? 'GraphQL error'))
  return d.data
}

export async function hardcoverSeries(q: SeriesQuery, token: string): Promise<SeriesResult | null> {
  let name = q.series?.trim()
  if (!name) {
    const d = await hcQuery(token, 'query($q:String!){ search(query:$q, query_type:"Book", per_page:5){ results } }', { q: `${q.title} ${q.author ?? ''}`.trim() })
    const hits: any[] = d?.search?.results?.hits ?? []
    name = hits.map((h) => h?.document).find((doc) => doc?.series_names?.length)?.series_names?.[0]
  }
  if (!name) return null
  const d = await hcQuery(token, `query($n:String!){ series(where:{name:{_ilike:$n}}, limit:5, order_by:{books_count:desc}){ id name books_count book_series(order_by:{position:asc}){ position book{ title release_year cached_image cached_contributors } } } }`, { n: `%${name}%` })
  const rows: any[] = d?.series ?? []
  if (!rows.length) return null
  const best = rows.find((r) => normTitle(r.name) === normTitle(name!)) ?? rows[0]
  const books: SeriesBook[] = (best.book_series ?? []).filter((x: any) => x?.book?.title).map((x: any) => ({
    position: typeof x.position === 'number' ? x.position : undefined, title: x.book.title, year: x.book.release_year ?? undefined,
    coverUrl: x.book.cached_image?.url, authors: (Array.isArray(x.book.cached_contributors) ? x.book.cached_contributors : []).map((c: any) => c?.author?.name).filter(Boolean),
  }))
  return books.length ? { name: best.name, provider: 'hardcover', books } : null
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
  return books.length ? { name: seriesName ?? q.series ?? q.title, provider: 'inventaire', books } : null
}

/** Try Hardcover first (if a token is saved), then Inventaire. Returns readable notes about what happened. */
export async function findSeries(q: SeriesQuery): Promise<FindSeriesOutcome> {
  const notes: string[] = []
  const token = getSettings().hardcoverToken
  if (token) {
    try { const r = await hardcoverSeries(q, token); if (r) return { result: r, notes }; notes.push('Hardcover had no series for this book.') }
    catch (e) { notes.push(`Hardcover: ${(e as Error).message}.`) }
  }
  try { const r = await inventaireSeries(q); if (r) return { result: r, notes }; notes.push('Inventaire had no series for this book.') }
  catch (e) { notes.push(`Inventaire: ${(e as Error).message}.`) }
  return { result: null, notes }
}

/* ---------------- connection tests (Settings) ---------------- */
export interface TestOutcome { ok: boolean; message: string; ms: number }
export async function testHardcover(token: string): Promise<TestOutcome> {
  const t0 = Date.now()
  if (!token.trim()) return { ok: false, message: 'Paste your Hardcover token first.', ms: 0 }
  try {
    const d = await hcQuery(token, 'query { me { username } }')
    const me = Array.isArray(d?.me) ? d.me[0] : d?.me
    return { ok: true, message: `Connected${me?.username ? ` as ${me.username}` : ''}.`, ms: Date.now() - t0 }
  } catch (e) { return { ok: false, message: (e as Error).message, ms: Date.now() - t0 } }
}
export async function testInventaire(): Promise<TestOutcome> {
  const t0 = Date.now()
  try {
    const d = await fetchJson(`${INV}/search?search=dune&types=series&limit=3&lang=en`)
    const n = (d?.results ?? []).length
    return { ok: n > 0, message: n > 0 ? `Connected. Found ${n} series for “dune”.` : 'Reached Inventaire, but the search returned nothing.', ms: Date.now() - t0 }
  } catch (e) { return { ok: false, message: (e as Error).message, ms: Date.now() - t0 } }
}
