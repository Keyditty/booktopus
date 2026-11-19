const STOP_PREFIX = /^(the|a|an)\s+/
const NOISE = /\b(unabridged|abridged|a novel|a memoir|audiobook|audio book|ebook|kindle edition|illustrated edition|special edition|anniversary edition|movie tie[- ]in)\b/g

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Split "Title: Subtitle" and pull a "(Series, Book 3)" suffix out of a raw title. */
export function splitTitle(raw: string): { title: string; subtitle?: string; series?: string; seriesNumber?: number } {
  let t = raw.replace(/\s+/g, ' ').trim()
  let series: string | undefined
  let seriesNumber: number | undefined
  const paren = t.match(/\s*[(\[]([^()\[\]]*?)(?:,|\s)\s*(?:book|bk\.?|#|vol\.?|volume)\s*#?\s*(\d+(?:\.\d+)?)\s*[)\]]\s*$/i)
  if (paren) {
    series = paren[1].replace(/[,\s]+$/, '').replace(/\s+series$/i, '').trim() || undefined
    seriesNumber = parseFloat(paren[2])
    t = t.slice(0, paren.index).trim()
  } else {
    const p2 = t.match(/\s*[(\[]([^()\[\]]+?)\s*#\s*(\d+(?:\.\d+)?)[)\]]\s*$/)
    if (p2) { series = p2[1].trim(); seriesNumber = parseFloat(p2[2]); t = t.slice(0, p2.index).trim() }
  }
  const idx = t.indexOf(': ')
  if (idx > 2) return { title: t.slice(0, idx).trim(), subtitle: t.slice(idx + 2).trim(), series, seriesNumber }
  return { title: t, series, seriesNumber }
}

/** Matching key for a title: ignores case, accents, punctuation, subtitle, leading article, edition noise. */
export function normTitle(raw: string): string {
  let t = stripDiacritics(raw).toLowerCase()
  t = t.replace(/[(\[][^)\]]*[)\]]/g, ' ')
  const colon = t.indexOf(':')
  if (colon > 2) t = t.slice(0, colon)
  t = t.replace(NOISE, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.replace(STOP_PREFIX, '').trim()
}

/** "Weir, Andy" -> "Andy Weir"; strips roles like "(Author)", "- narrator". */
export function cleanAuthor(raw: string): string {
  let a = raw.replace(/[(\[][^)\]]*[)\]]/g, ' ').replace(/\s+-\s+(author|narrator|translator|editor)\b.*$/i, '')
  a = a.replace(/^\s*(by|written by|author:?)\s+/i, '').replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '')
  const m = a.match(/^([^,]+),\s*([^,]+)$/)
  if (m && !/\b(jr|sr|ii|iii|iv)\b/i.test(m[2])) a = `${m[2].trim()} ${m[1].trim()}`
  return a
}

export function splitAuthors(raw: string): string[] {
  if (!raw) return []
  let parts: string[]
  if (/;|&|\band\b|\//i.test(raw)) parts = raw.split(/;|&|\band\b|\//i)
  else if (raw.includes(',')) {
    const p = raw.split(',').map((x) => x.trim()).filter(Boolean)
    // "Weir, Andy" is one person written Last, First; "Neil Gaiman, Terry Pratchett" is two.
    parts = p.length === 2 && p[0].split(' ').length === 1 ? [raw] : p
  } else parts = [raw]
  return parts.map(cleanAuthor).filter((a) => a && !/^(unknown|various)$/i.test(a))
}

/** author key = lastname + first initial */
export function authorKey(raw: string): string {
  const n = stripDiacritics(cleanAuthor(raw)).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = n.split(' ').filter((p) => !/^(jr|sr|ii|iii|iv|dr|mr|mrs|ms)$/.test(p))
  if (!parts.length) return ''
  return `${parts[parts.length - 1]}|${parts[0][0]}`
}

export function authorsCompatible(a: string[], b: string[]): boolean | undefined {
  if (!a.length || !b.length) return undefined // unknown
  const ka = new Set(a.map(authorKey).filter(Boolean))
  return b.map(authorKey).some((k) => ka.has(k))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }
/** numbers in a title ("Book 2", "Part III") — differing numbers means different books in a series */
export function numberTokens(norm: string): string[] {
  return norm.split(' ').map((w) => (/^\d+$/.test(w) ? w : ROMAN[w] && norm.split(' ').length > 1 ? ROMAN[w] : '')).filter(Boolean)
}

export function titleSimilarity(a: string, b: string): number {
  const na = normTitle(a), nb = normTitle(b)
  const da = numberTokens(na).join(','), db = numberTokens(nb).join(',')
  if (da !== db) return Math.min(0.5, similarity(na, nb)) // "Book 2" vs "Book 3": never a match
  return similarity(na, nb)
}

export function normIsbn(s?: string): string | undefined {
  if (!s) return undefined
  const d = s.replace(/[^0-9xX]/g, '').toUpperCase()
  return d.length === 10 || d.length === 13 ? d : undefined
}

export function newId(): string {
  return (crypto as Crypto).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  if (!s) return undefined
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    let mo = +m[1], d = +m[2]
    if (mo > 12) [mo, d] = [d, mo]
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const t = Date.parse(s.replace(/\bat\b/i, ''))
  if (!isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  return undefined
}

export function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function bookKeyOf(title: string, authors: string[]): string {
  return `${normTitle(title)}|${authors[0] ? authorKey(authors[0]) : ''}`
}

/** Today's date in the reader's OWN time zone as YYYY-MM-DD (toISOString() would use UTC and can land on tomorrow's date in the evening). */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
