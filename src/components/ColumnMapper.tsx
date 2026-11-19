import { useEffect, useMemo, useState } from 'react'
import { bestSheet, type Sheet } from '../lib/importers/xlsx'
import { FIELD_LABEL, guessHeaderRow, guessMap, mapRows, type ColumnMap, type Field } from '../lib/importers/table'
import type { Candidate, Format, SourceName } from '../types'

const FIELDS: Field[] = ['title', 'author', 'series', 'issue', 'status', 'rating', 'year', 'format', 'publisher', 'isbn', 'notes']
const letter = (i: number) => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }

/**
 * "Which column is which?" for spreadsheets. Guesses the header row and columns, shows a live preview, and lets the reader correct it
 * before anything is added. This is what makes any collection spreadsheet importable, not just ones with a column called "Title".
 */
export function ColumnMapper({ fileName, sheets, source, format, onDone, onCancel }: {
  fileName: string; sheets: Sheet[]; source: SourceName; format?: Format
  onDone: (c: Candidate[], notes: string[]) => void; onCancel: () => void
}) {
  const first = useMemo(() => Math.max(0, sheets.indexOf(bestSheet(sheets))), [sheets])
  const [si, setSi] = useState(first)
  const rows = sheets[si].rows
  const [hdr, setHdr] = useState(() => guessHeaderRow(rows))
  const [map, setMap] = useState<ColumnMap>(() => guessMap(rows[guessHeaderRow(rows)] ?? []))
  const [comics, setComics] = useState(() => /comic|manga|graphic/i.test(fileName + ' ' + sheets[first].name) || guessMap(rows[guessHeaderRow(rows)] ?? []).issue != null)
  useEffect(() => { const h = guessHeaderRow(sheets[si].rows); setHdr(h); setMap(guessMap(sheets[si].rows[h] ?? [])) }, [si, sheets])
  const width = Math.max(1, ...rows.slice(0, 40).map((r) => r.length))
  const labels = Array.from({ length: width }, (_, i) => (rows[hdr]?.[i]?.trim() ? `${rows[hdr][i]} (col ${letter(i)})` : `Column ${letter(i)}`))
  const preview = useMemo(() => (map.title == null ? { candidates: [], skipped: 0 } : mapRows(rows, hdr, map, { source, provenance: `Spreadsheet “${fileName}”`, comics, format })), [rows, hdr, map, comics, source, fileName, format])
  const setField = (f: Field, v: string) => setMap((m) => { const n = { ...m }; if (v === '') delete n[f]; else n[f] = +v; return n })
  const lbl = 'block text-xs font-semibold text-muted'

  return (
    <div className="fade-in mt-4" aria-label="Choose spreadsheet columns">
      <div className="card p-4">
        <p className="text-sm"><strong>{fileName}</strong> · {sheets.length > 1 ? `${sheets.length} sheets` : '1 sheet'} · {rows.length.toLocaleString()} rows</p>
        {sheets.length > 1 && (
          <label className={`${lbl} mt-3`} htmlFor="map-sheet">Which sheet has your books?
            <select id="map-sheet" className="field mt-1 font-normal text-ink" value={si} onChange={(e) => setSi(+e.target.value)}>{sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.rows.filter((r) => r.filter(Boolean).length >= 2).length} rows)</option>)}</select></label>
        )}
        <label className={`${lbl} mt-3`} htmlFor="map-hdr">The column headings are on row
          <input id="map-hdr" type="number" min={1} max={Math.max(1, rows.length)} className="field mt-1 !w-24 font-normal text-ink" value={hdr + 1} onChange={(e) => { const n = Math.max(1, Math.min(rows.length || 1, +e.target.value || 1)) - 1; setHdr(n); setMap(guessMap(rows[n] ?? [])) }} /></label>
        <p className="mt-3 text-sm font-semibold">What is in each column?</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f} className={lbl}>{FIELD_LABEL[f]}{f === 'title' ? ' (required)' : ''}
              <select className="field mt-1 !min-h-10 text-sm font-normal text-ink" value={map[f] ?? ''} onChange={(e) => setField(f, e.target.value)}>
                <option value="">{f === 'title' ? 'Choose a column…' : '— not used —'}</option>
                {labels.map((l, i) => <option key={i} value={i}>{l}</option>)}
              </select></label>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={comics} onChange={(e) => setComics(e.target.checked)} /> These are comics / graphic novels</label>
        {map.issue != null && <p className="mt-1 text-xs text-muted">The issue number is added to the title, like “Saga #12”.</p>}
      </div>

      <div className="card mt-3 p-4" role="status" aria-live="polite">
        {map.title == null
          ? <p className="text-sm text-rust">Choose which column holds the titles and I’ll show you a preview.</p>
          : <>
              <p className="text-sm"><strong>{preview.candidates.length.toLocaleString()}</strong> {comics ? 'comics' : 'books'} found{preview.skipped ? ` (${preview.skipped} rows skipped: no title)` : ''}. First few:</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">{preview.candidates.slice(0, 6).map((c, i) => <li key={i} className="truncate">• {c.title}{c.authors[0] ? ` — ${c.authors[0]}` : ''}{c.year ? ` (${c.year})` : ''}</li>)}</ul>
              {preview.candidates.length === 0 && <p className="mt-1 text-sm text-rust">Nothing found with these choices. Try a different title column, header row, or sheet.</p>}
            </>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="text-sm text-muted underline" onClick={onCancel}>Choose a different file</button>
        <button className="btn btn-primary ml-auto" disabled={!preview.candidates.length} onClick={() => onDone(preview.candidates, preview.skipped ? [`${preview.skipped} spreadsheet rows without a title were skipped.`] : [])}>Find my books</button>
      </div>
    </div>
  )
}
