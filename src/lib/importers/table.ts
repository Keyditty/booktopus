import type { Candidate, Format, SourceName } from '../../types'
import { normIsbn, parseDate, splitAuthors } from '../normalize'
import { makeCandidate, ratingFrom, statusFromText } from './common'

/**
 * Turning an arbitrary spreadsheet into books. Real collection spreadsheets rarely have a column literally named "Title":
 * comic lists have Series + Issue #, others have "Book Name", banner rows above the headers, and so on. So we guess the
 * header row and the columns, and the reader can correct the guess before anything is imported.
 */
export type Field = 'title' | 'author' | 'series' | 'issue' | 'publisher' | 'year' | 'format' | 'status' | 'rating' | 'isbn' | 'notes' | 'date'
export type ColumnMap = Partial<Record<Field, number>>
export const FIELD_LABEL: Record<Field, string> = { title: 'Title', author: 'Author / writer', series: 'Series', issue: 'Issue / book number', publisher: 'Publisher', year: 'Year', format: 'Format', status: 'Read status', rating: 'My rating', isbn: 'ISBN', notes: 'Notes', date: 'Date' }

const SYN: Record<Field, string[]> = {
  title: ['title', 'book title', 'book', 'book name', 'name', 'comic title', 'comic', 'issue title', 'item', 'product', 'story', 'volume title'],
  author: ['author', 'authors', 'writer', 'writers', 'creator', 'creators', 'by', 'written by', 'author name'],
  series: ['series', 'series name', 'series title', 'run', 'collection'],
  issue: ['issue', 'issue #', 'issue no', 'issue number', 'no', 'no.', '#', 'number', 'num', 'vol', 'vol.', 'volume', 'book number', 'book #', 'series number', 'series #'],
  publisher: ['publisher', 'imprint', 'label'],
  year: ['year', 'published', 'publication year', 'release year', 'cover date', 'date published'],
  format: ['format', 'type', 'media', 'edition'],
  status: ['status', 'read', 'read?', 'have read', 'reading status', 'shelf', 'exclusive shelf', 'finished'],
  rating: ['rating', 'my rating', 'stars', 'score'],
  isbn: ['isbn', 'isbn13', 'isbn 13', 'isbn10', 'upc'],
  notes: ['notes', 'note', 'comments', 'comment', 'condition notes', 'review'],
  date: ['date read', 'date finished', 'finished on', 'date completed', 'read on'],
}
const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Which row holds the column headings? Skips banner/title rows: the first of the opening rows that has several short text cells. */
export function guessHeaderRow(rows: string[][]): number {
  let best = 0, bestScore = -1
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = rows[i].filter(Boolean)
    if (cells.length < 2) continue
    const known = cells.filter((c) => Object.values(SYN).some((list) => list.includes(norm(c)))).length
    const shortText = cells.filter((c) => c.length <= 30 && !/^\d+([.,]\d+)?$/.test(c)).length
    const score = known * 3 + shortText + (cells.length >= 3 ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

/** Suggest what each column means. Returns null for `title` only when nothing at all looks usable. */
export function guessMap(header: string[]): ColumnMap {
  const map: ColumnMap = {}
  const h = header.map(norm)
  for (const f of Object.keys(SYN) as Field[]) {
    const idx = h.findIndex((c) => SYN[f].includes(c))
    if (idx >= 0 && !Object.values(map).includes(idx)) map[f] = idx
  }
  // comic lists: Series + Issue # and no title column. The series name is the title and the issue number is appended.
  if (map.title == null && map.series != null) { map.title = map.series; delete map.series }
  if (map.title == null) { const t = h.findIndex((c) => /title|name|book|comic/.test(c)); if (t >= 0) map.title = t }
  return map
}

const cleanIssue = (v: string) => v.replace(/^#\s*/, '').replace(/\.0+$/, '').trim()

export interface MapOptions { source: SourceName; provenance: string; comics?: boolean; format?: Format }

/** Rows below the header, turned into candidates using the chosen columns. Blank rows and rows without a title are skipped. */
export function mapRows(rows: string[][], headerRow: number, map: ColumnMap, o: MapOptions): { candidates: Candidate[]; skipped: number } {
  const cell = (r: string[], f: Field) => (map[f] != null ? (r[map[f]!] ?? '').trim() : '')
  const out: Candidate[] = []
  let skipped = 0
  const comics = !!o.comics || o.format === 'comic'
  for (const r of rows.slice(headerRow + 1)) {
    if (!r.some((c) => c && c.trim())) continue
    let title = cell(r, 'title')
    if (!title) { skipped++; continue }
    const issue = cell(r, 'issue')
    const series = cell(r, 'series')
    const iss = issue ? cleanIssue(issue) : ''
    const asIssue = iss && /^[\w.\-]+$/.test(iss)
    if (asIssue && !new RegExp(`(^|[#\\s])${iss.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}$`).test(title)) title = `${title} #${iss}`
    const rawStatus = cell(r, 'status')
    const statusHead = map.status != null ? norm(rows[headerRow]?.[map.status] ?? '') : ''
    // a column headed "Read?" / "Have read" holds yes/no style values rather than words like "finished"
    const yesNo = /^(read\??|have read|finished|owned|read it)$/.test(statusHead) ? (/^(y|yes|true|x|✓|✔|1|done|read|finished)$/i.test(rawStatus) ? 'finished' : /^(n|no|false|0)$/i.test(rawStatus) ? 'none' : '') : ''
    const st = yesNo === 'finished' ? { status: 'finished' as const } : yesNo === 'none' ? {} : statusFromText(rawStatus)
    const yearRaw = cell(r, 'year'), year = parseInt(yearRaw.match(/\d{4}/)?.[0] ?? '') || undefined
    const finished = parseDate(cell(r, 'date'))
    const c = makeCandidate({
      title, source: o.source, provenance: o.provenance, authors: splitAuthors(cell(r, 'author')),
      series: series || undefined, seriesNumber: asIssue && Number.isFinite(parseFloat(iss)) ? parseFloat(iss) : undefined,
      format: comics ? 'comic' : o.format ?? 'unknown', year,
      identifiers: { isbn: normIsbn(cell(r, 'isbn').replace(/[="]/g, '')) },
      status: st.status ?? (finished ? 'finished' : undefined), wantToRead: st.wantToRead, finishedAt: finished,
      rating: cell(r, 'rating') ? ratingFrom(cell(r, 'rating')) : undefined,
      notes: [cell(r, 'publisher') && `Publisher: ${cell(r, 'publisher')}`, cell(r, 'notes')].filter(Boolean).join(' · ') || undefined,
      confidence: 0.9,
    })
    out.push(c)
  }
  return { candidates: out, skipped }
}
