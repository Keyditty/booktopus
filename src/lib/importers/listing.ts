import type { Candidate, Format, SourceName } from '../../types'
import { parseDate, splitAuthors } from '../normalize'
import { parseCsv, rowsToObjects } from './csv'
import { formatFromText, makeCandidate, rowToCandidate } from './common'

/**
 * Parses text copied from a signed-in Audible library page or Hoopla History page (or OCR output that has been
 * laid out as blocks). Blocks are separated by blank lines; labels like "By:", "Narrated by:", "Series:" are used
 * when present, otherwise "Title / Author" two-line blocks are assumed. Anything uncertain gets a low confidence
 * so it lands on the review screen.
 */
const SKIP_MEDIA = /\b(movie|film|music|album|song|television|tv show|tv series|episode)\b/i
const UI_NOISE = /^(play|download|share|more|options|sample|add to|remove|return|borrow(ed)?\s*(now)?|read now|listen now|sort( by)?|filter|search|library|home|history|my hoopla|cancel|done|settings|menu|back|rate|review|mark as|view|see all|\d+%|\d+ (hrs?|mins?|hours?|minutes?).*|[<>•·\-–—]+)$/i

const LABEL = /^(by|author|authors|written by|narrated by|narrator|read by|series|length|duration|release date|language|program type|publisher|borrowed|returned|due|expires|checked out|format|type|rating|summary)\s*:?\s*(.*)$/i

export function parseListing(text: string, source: SourceName, opts: { filename?: string; includeOtherMedia?: boolean; provenance?: string } = {}): { candidates: Candidate[]; skippedMedia: number } {
  const prov = opts.provenance ?? `${source} copied text${opts.filename ? ` (${opts.filename})` : ''}`
  const t = text.trim()
  // structured exports first (Audible Library Extractor / OpenAudible CSV, JSON)
  if (/^[\[{]/.test(t) || /(^|[,\t;])\s*"?(title|asin)"?\s*([,\t;]|$)/i.test(t.split('\n')[0] ?? '')) {
    try {
      const objs: Record<string, string>[] = /^[\[{]/.test(t)
        ? ((): Record<string, string>[] => { const d = JSON.parse(t); const a = Array.isArray(d) ? d : d.books ?? d.items ?? d.library ?? []; return a.map((x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k.toLowerCase().replace(/[_\-]+/g, ' '), Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v)]))) })()
        : rowsToObjects(parseCsv(t))
      const cands = objs.map((o) => rowToCandidate(o, { source, provenance: prov })).filter((c): c is Candidate => !!c)
      cands.forEach((c) => { if (source === 'audible') { c.source = 'audible'; c.format = c.format === 'unknown' ? 'audiobook' : c.format; c.activity = 'purchased' } })
      if (cands.length) return { candidates: cands, skippedMedia: 0 }
    } catch { /* fall through to text */ }
  }

  const blocks = t.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length)
  const out: Candidate[] = []
  let skippedMedia = 0
  for (const rawBlock of blocks) {
    const block = splitMergedBlock(rawBlock)
    for (const b of block) {
      const r = parseBlock(b, source, prov)
      if (!r) continue
      if (r.skip && !opts.includeOtherMedia) { skippedMedia++; continue }
      out.push(r.cand)
    }
  }
  return { candidates: out, skippedMedia }
}

/** A block with several "By:" lines is multiple books copied without blank lines: split before each title line. */
function splitMergedBlock(lines: string[]): string[][] {
  const byIdx = lines.map((l, i) => (/^(by|written by)\s*:/i.test(l) ? i : -1)).filter((i) => i > 0)
  if (byIdx.length <= 1) return [lines]
  const starts = byIdx.map((i) => i - 1)
  const out: string[][] = []
  starts.forEach((s, k) => out.push(lines.slice(k === 0 ? 0 : s, k + 1 < starts.length ? starts[k + 1] : lines.length)))
  return out
}

function parseBlock(lines: string[], source: SourceName, prov: string): { cand: Candidate; skip: boolean } | null {
  const labeled: Record<string, string> = {}
  const free: string[] = []
  let completion: Candidate['completionHint']
  let mediaText = ''
  for (const l of lines) {
    if (/^finished$/i.test(l)) { completion = { value: 'finished', note: `${source} listing said “Finished”` }; continue }
    const pct = l.match(/^(\d{1,3})%\s*(complete|done|listened)?$/i)
    if (pct && +pct[1] > 0 && +pct[1] < 100) { completion = { value: 'in_progress', note: `${source} listing showed ${pct[1]}% progress` }; continue }
    if (/^(audiobook|ebook|e-book|comic|graphic novel|movie|music|album|television|tv)s?$/i.test(l)) { mediaText += ' ' + l; continue }
    const lm = l.match(LABEL)
    if (lm && lm[2] !== '' ) { labeled[lm[1].toLowerCase()] = lm[2].trim(); continue }
    if (UI_NOISE.test(l)) continue
    free.push(l)
  }
  const title = free[0]
  if (!title || title.length < 2) return null
  const authorRaw = labeled['by'] || labeled['author'] || labeled['authors'] || labeled['written by'] || (free[1] && !labeled['by'] ? free[1].replace(/^by\s+/i, '') : '')
  const hasLabel = !!(labeled['by'] || labeled['author'] || labeled['written by'])
  const skip = SKIP_MEDIA.test(mediaText + ' ' + (labeled['program type'] ?? ''))
  const format: Format = formatFromText(mediaText + ' ' + (labeled['format'] ?? labeled['type'] ?? '') + (source === 'audible' ? ' audiobook' : ''))
  const seriesRaw = labeled['series']
  let series: string | undefined, seriesNumber: number | undefined
  if (seriesRaw) { const m = seriesRaw.match(/^(.*?)[,\s]+(?:book\s*)?#?(\d+(?:\.\d+)?)\s*$/i); series = (m ? m[1] : seriesRaw).trim(); seriesNumber = m ? parseFloat(m[2]) : undefined }
  const borrowed = parseDate(labeled['borrowed'] || labeled['checked out'])
  const returned = parseDate(labeled['returned'])
  const events: Candidate['events'] = []
  if (borrowed) events.push({ type: 'borrowed', date: borrowed })
  if (returned) events.push({ type: 'returned', date: returned })
  const cand = makeCandidate({
    title, authors: authorRaw ? splitAuthors(authorRaw) : [], narrator: labeled['narrated by'] || labeled['narrator'] || labeled['read by'],
    series, seriesNumber, format, source, provenance: prov, events, completionHint: completion,
    activity: source === 'audible' ? 'purchased' : returned ? 'returned' : borrowed ? 'borrowed' : 'unknown',
    confidence: hasLabel ? 0.9 : authorRaw ? 0.75 : 0.5,
  })
  return { cand, skip }
}
