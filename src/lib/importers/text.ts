import type { Candidate, ReadingStatus } from '../../types'
import { splitAuthors } from '../normalize'
import { parseCsv, rowsToObjects } from './csv'
import { makeCandidate, ratingFrom, rowToCandidate, statusFromText } from './common'
import type { SourceName } from '../../types'

export interface ParseResult { candidates: Candidate[]; ignoredLines: number; format: 'json' | 'csv' | 'markdown-table' | 'text' }

const CHATTER = /^(sure|here( is|'s| are)|great|of course|certainly|okay|ok\b|absolutely|let me|i('ll| will| can| have)|would you|do you|if you|note:|tip:|you said|chatgpt said|user:|assistant:|me:|you:|total|summary|let me know|feel free|hope this|these are|this list)/i


function stripMarkup(line: string): string {
  return line
    .replace(/^\s*(?:[-*•▪◦►➤✓✔☑☐✅❌]+|\d{1,3}[.)])\s+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pull trailing "(finished)", "⭐⭐⭐⭐", "4/5", "— DNF" style annotations off a line. */
function extractAnnotations(s: string): { text: string; status?: ReadingStatus; wantToRead?: boolean; rating?: number; favorite?: boolean } {
  let text = s
  let rating: number | undefined
  let favorite: boolean | undefined
  const stars = text.match(/(?:[⭐★]\s*){1,5}/)
  if (stars) { rating = (stars[0].match(/[⭐★]/g) || []).length; text = text.replace(stars[0], ' ') }
  const slash = text.match(/\b([1-5](?:\.\d)?)\s*\/\s*5\b/)
  if (slash) { rating = Math.round(parseFloat(slash[1])); text = text.replace(slash[0], ' ') }
  if (/[❤♥💖💗]|\bfavou?rite\b/i.test(text)) { favorite = true; text = text.replace(/[❤♥💖💗️]|\(?\bfavou?rite\b\)?/gi, ' ') }
  let st: ReturnType<typeof statusFromText> = {}
  const paren = text.match(/[(\[]([^()\[\]]{2,30})[)\]]\s*$/)
  if (paren) {
    const s2 = statusFromText(paren[1])
    if (s2.status || s2.wantToRead) { st = s2; text = text.slice(0, paren.index) }
  }
  const emoji = text.match(/[✅✔]/)
  if (emoji) { st = { status: 'finished' }; text = text.replace(/[✅✔️]/g, ' ') }
  const dash = text.match(/\s[-–—|]\s*(finished|completed|dnf|did not finish|reading|listening|currently reading|want to read|to read)\s*\.?$/i)
  if (dash) { st = statusFromText(dash[1]); text = text.slice(0, dash.index) }
  return { text: text.replace(/\s+/g, ' ').trim(), ...st, rating, favorite }
}

/** Parse one prose/list line into title + author, or null if it doesn't look like a book record. */
function parseBookLine(raw: string, listItem: boolean): { title: string; authors: string[]; loose: boolean; ann: ReturnType<typeof extractAnnotations> } | null {
  const ann = extractAnnotations(stripMarkup(raw))
  let s = ann.text
  if (!s || s.length < 3 || s.length > 200) return null
  s = s.replace(/^["“”']+|["“”']+$/g, '').trim()
  let m: RegExpMatchArray | null
  // "Title" by Author   /   Title by Author
  if ((m = s.match(/^["“]?(.+?)["”]?,?\s+by\s+(.+)$/i)) && m[1].length > 1) return { title: clean(m[1]), authors: splitAuthors(clean(m[2])), loose: false, ann }
  // Title (Author)
  if ((m = s.match(/^(.+?)\s*\(([A-Z][^()]{3,60})\)$/)) && /\s/.test(m[2]) && !/\b(book|series|#|vol)/i.test(m[2])) return { title: clean(m[1]), authors: splitAuthors(m[2]), loose: false, ann }
  // Title — Author  / Title - Author / Title – Author / Title | Author
  if ((m = s.match(/^["“]?(.+?)["”]?\s+[–—|-]\s+(.+)$/)) && wordCount(m[2]) <= 6 && /^[A-ZÀ-Ý"“]/.test(m[2])) return { title: clean(m[1]), authors: splitAuthors(clean(m[2])), loose: false, ann }
  // Title: Author is ambiguous with subtitles — skip.
  if (!listItem) return null
  // bare list entry — a candidate title only if it's short and not a sentence
  if (wordCount(s) <= 9 && !/[.!?]$/.test(s) && !CHATTER.test(s) && /[A-Za-z]/.test(s)) return { title: clean(s), authors: [], loose: true, ann }
  return null
}

const clean = (s: string) => s.replace(/^["“”'\s]+|["“”'\s,.:;]+$/g, '').trim()
const wordCount = (s: string) => s.trim().split(/\s+/).length

export function parseBookText(input: string, opts: { source?: SourceName; filename?: string; provenance?: string } = {}): ParseResult {
  const source = opts.source ?? 'chatgpt'
  const prov = opts.provenance ?? `Pasted list${opts.filename ? ` (${opts.filename})` : ''}`
  const text = input.replace(/\r\n?/g, '\n').trim()
  if (!text) return { candidates: [], ignoredLines: 0, format: 'text' }

  // 1. JSON
  if (/^[\[{]/.test(text)) {
    try {
      const data = JSON.parse(text)
      const arr: unknown[] = Array.isArray(data) ? data : (data.books ?? data.items ?? data.library ?? data.results ?? [])
      const cands = arr.map((x) => {
        if (typeof x === 'string') { const r = parseBookLine(x, true); return r ? makeCandidate({ title: r.title, authors: r.authors, source, provenance: prov, confidence: 0.8 }) : null }
        const o = Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k.toLowerCase().replace(/[_\-]+/g, ' '), Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v)]))
        return rowToCandidate(o, { source, provenance: prov })
      }).filter((c): c is Candidate => !!c)
      if (cands.length) return { candidates: cands, ignoredLines: 0, format: 'json' }
    } catch { /* not JSON, fall through */ }
  }

  const lines = text.split('\n')

  // 2. Markdown / pipe tables (can appear amid chatter) — collect each table block
  const tableCands: Candidate[] = []
  let tableLineIdx = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      let j = i + 2
      const head = lines[i].split('|').slice(1, -1).map((c) => c.trim())
      const rows: string[][] = [head]
      tableLineIdx.add(i); tableLineIdx.add(i + 1)
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) { rows.push(lines[j].split('|').slice(1, -1).map((c) => c.replace(/\*\*|__/g, '').trim())); tableLineIdx.add(j); j++ }
      for (const o of rowsToObjects(rows)) { const c = rowToCandidate(o, { source, provenance: prov }); if (c) tableCands.push(c) }
      i = j - 1
    }
  }

  // 3. CSV / TSV: header row mentions a title column and most lines have the same delimiter count
  const nonTableLines = lines.filter((_, i) => !tableLineIdx.has(i))
  if (!tableCands.length) {
    const first = nonTableLines.find((l) => l.trim()) ?? ''
    if (/(^|[,\t;|])\s*"?(title|book title|book|name)"?\s*([,\t;|]|$)/i.test(first) && /[,\t;|]/.test(first)) {
      const objs = rowsToObjects(parseCsv(text))
      const cands = objs.map((o) => rowToCandidate(o, { source, provenance: prov })).filter((c): c is Candidate => !!c)
      if (cands.length) return { candidates: cands, ignoredLines: 0, format: 'csv' }
    }
  }

  // 4. Free text: lists, headings that imply status, chatter to ignore
  const cands: Candidate[] = [...tableCands]
  let ignored = 0
  let section: { status?: ReadingStatus; wantToRead?: boolean; favorite?: boolean } = {}
  nonTableLines.forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) return
    const bare = stripMarkup(line).replace(/[:：]\s*$/, '')
    const isList = /^\s*(?:[-*•▪◦►➤✓✔☑☐✅❌]+|\d{1,3}[.)])\s+/.test(rawLine)
    // heading? (no list marker, short, matches a known shelf word)
    if (!isList && (/^#{1,6}\s/.test(line) || /^(\*\*|__).+(\*\*|__):?$/.test(line) || /:\s*$/.test(line) || wordCount(bare) <= 5)) {
      const h = bare.replace(/^#+\s*/, '').replace(/\s*\(\d+\)$/, '')
      const st = statusFromText(h)
      if ((st.status || st.wantToRead) && wordCount(h) <= 6) { section = st; return }
      if (/favou?rites?/i.test(h) && wordCount(h) <= 4) { section = { ...section, favorite: true }; return }
      if (/^(#{1,6}\s|\*\*|__)/.test(line) && !/\sby\s/i.test(line)) { section = {}; ignored++; return } // other headings reset the section
    }
    if (CHATTER.test(bare)) { ignored++; return }
    const r = parseBookLine(line, isList)
    if (!r) { ignored++; return }
    const st = r.ann.status || r.ann.wantToRead ? { status: r.ann.status, wantToRead: r.ann.wantToRead } : section
    cands.push(makeCandidate({
      title: r.title, authors: r.authors, source, provenance: prov,
      status: st.status, wantToRead: st.wantToRead,
      favorite: r.ann.favorite || section.favorite || undefined,
      rating: r.ann.rating,
      confidence: r.loose ? 0.55 : 0.85,
    }))
  })
  return { candidates: cands, ignoredLines: ignored, format: tableCands.length ? 'markdown-table' : 'text' }
}

export { ratingFrom }
