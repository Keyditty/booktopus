import type { Candidate, EventType, Format, SourceActivity } from '../../types'
import { bookKeyOf, normIsbn, parseDate, splitAuthors } from '../normalize'
import { parseCsv, rowsToObjects } from './csv'
import { formatFromText, makeCandidate } from './common'

/**
 * Libby "Timeline" export. Libby lets you export your timeline (Actions > Export timeline) as a table/CSV.
 * We could not retrieve Libby's help page from the build sandbox, so column names are matched tolerantly
 * (any of several spellings) instead of assuming a fixed layout. Each row is one *event*
 * (borrowed / returned / hold ...); events for the same title are grouped into one candidate.
 */
function eventType(raw: string): EventType {
  const s = raw.toLowerCase()
  if (/return/.test(s)) return 'returned'
  if (/renew/.test(s)) return 'renewed'
  if (/hold|waitlist/.test(s)) return 'hold'
  if (/borrow|check(ed)?[- ]?out|loan/.test(s)) return 'borrowed'
  return 'other'
}

export function parseLibby(text: string, filename?: string): { candidates: Candidate[]; skipped: number } {
  const prov = `Libby timeline${filename ? ` (${filename})` : ''}`
  let rows: Record<string, string>[]
  const t = text.trim()
  if (/^[\[{]/.test(t)) {
    const data = JSON.parse(t)
    const arr = Array.isArray(data) ? data : data.timeline ?? data.items ?? data.entries ?? []
    rows = arr.map((x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k.toLowerCase().replace(/[_\-]+/g, ' '), v == null ? '' : String(v)])))
  } else rows = rowsToObjects(parseCsv(t))

  const groups = new Map<string, Candidate>()
  let skipped = 0
  for (const o of rows) {
    const g = (...n: string[]) => { for (const k of n) if (o[k]) return o[k]; return '' }
    const title = g('title', 'book title', 'name')
    if (!title) { skipped++; continue }
    const fmtRaw = g('format', 'type', 'media', 'media type', 'content type')
    const detail = g('details', 'detail', 'description')
    if (/magazine|periodical/i.test(fmtRaw + ' ' + detail)) { skipped++; continue }
    const format: Format = formatFromText(fmtRaw + ' ' + detail)
    const isbn = normIsbn(g('isbn', 'isbn13', 'isbn 13').replace(/[="]/g, ''))
    const authors = splitAuthors(g('author', 'authors', 'creator', 'by'))
    const activityRaw = g('activity', 'action', 'event', 'type of activity')
    const date = parseDate(g('timestamp', 'date', 'activity date', 'time', 'when'))
    const etype = activityRaw ? eventType(activityRaw) : (g('returned', 'return date') ? 'returned' : 'borrowed')
    const library = g('library', 'library name', 'card', 'library card')
    const key = isbn || bookKeyOf(title, authors)
    let c = groups.get(key)
    if (!c) {
      c = makeCandidate({
        title, authors, source: 'libby', format, library: library || undefined, identifiers: { isbn },
        activity: 'unknown', events: [], provenance: prov, confidence: 0.95,
        // NOTE: no `status` — a Libby loan says nothing about whether Toni finished the book.
        sourceId: isbn ? undefined : undefined,
      })
      groups.set(key, c)
    }
    if (c.format === 'unknown' && format !== 'unknown') c.format = format
    c.events.push({ type: etype, date, detail: [activityRaw, library, detail].filter(Boolean).join(' · ') || undefined })
    // Libby's own "borrowed again" rows can appear for the same title: events carry the dates.
  }
  const out = [...groups.values()]
  for (const c of out) {
    const dated = c.events.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!))
    const last = [...dated].reverse().find((e) => ['borrowed', 'returned', 'hold'].includes(e.type))
    c.activity = (last?.type as SourceActivity) ?? (c.events.some((e) => e.type === 'borrowed') ? 'borrowed' : 'unknown')
  }
  return { candidates: out, skipped }
}
