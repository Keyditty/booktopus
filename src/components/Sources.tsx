import { useState } from 'react'
import { addSource, deleteSource, splitSource, updateSource } from '../lib/store'
import { FORMAT_LABEL, SERVICE_COLOR, SERVICE_LABEL, type BookView } from '../lib/shelves'
import type { ActivityEvent, Format, SourceActivity, SourceName } from '../types'

const ACTIVITY: [SourceActivity, string][] = [['purchased', 'Purchased'], ['borrowed', 'Borrowed'], ['returned', 'Returned'], ['hold', 'On hold'], ['available', 'Available'], ['unknown', 'In library']]
const SERVICES: SourceName[] = ['audible', 'libby', 'hoopla', 'manual', 'other']
const FORMATS: Format[] = ['audiobook', 'ebook', 'print', 'comic', 'unknown']

/** "Where you have it": each copy of the book (service + format) can be changed, removed, or added to. */
export function Sources({ v, events }: { v: BookView; events: ActivityEvent[] }) {
  const [editId, setEditId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [svc, setSvc] = useState<SourceName>('libby')
  const [fmt, setFmt] = useState<Format>('ebook')
  const [msg, setMsg] = useState('')
  const lbl = 'block text-[11px] font-semibold text-muted'
  return (
    <section className="mt-6" aria-label="Where you have it">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Where you have it</h3>
        <button className="text-xs text-accent underline" aria-expanded={adding} onClick={() => { setAdding(!adding); setMsg('') }}>{adding ? 'Cancel' : '＋ Add another place'}</button>
      </div>
      <ul className="mt-2 space-y-2">
        {v.sources.map((s) => {
          const evs = events.filter((e) => e.sourceRecordId === s.id && e.date).sort((a, c) => a.date!.localeCompare(c.date!))
          const editing = editId === s.id
          return (
            <li key={s.id} className="card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: SERVICE_COLOR[s.source] }} />
                <strong>{SERVICE_LABEL[s.source]}</strong><span className="text-muted">· {FORMAT_LABEL[s.format]} · {ACTIVITY.find((a) => a[0] === s.activity)![1]}</span>
                <button className="ml-auto text-xs text-accent underline" aria-expanded={editing} onClick={() => setEditId(editing ? null : s.id)}>{editing ? 'Done' : 'Change'}</button>
              </div>
              {editing && (
                <div className="fade-in mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className={lbl}>Service
                    <select className="field mt-1 !min-h-10 text-sm font-normal text-ink" value={s.source} onChange={(e) => updateSource(s.id, { source: e.target.value as SourceName })}>
                      {(SERVICES.includes(s.source) ? SERVICES : [...SERVICES, s.source]).map((x) => <option key={x} value={x}>{x === 'manual' ? 'I own it / bought it' : x === 'other' ? 'Somewhere else' : SERVICE_LABEL[x]}</option>)}
                    </select></label>
                  <label className={lbl}>Format
                    <select className="field mt-1 !min-h-10 text-sm font-normal text-ink" value={s.format} onChange={(e) => updateSource(s.id, { format: e.target.value as Format })}>
                      {FORMATS.map((x) => <option key={x} value={x}>{FORMAT_LABEL[x]}</option>)}</select></label>
                  <label className={lbl}>Status there
                    <select className="field mt-1 !min-h-10 text-sm font-normal text-ink" value={s.activity} onChange={(e) => updateSource(s.id, { activity: e.target.value as SourceActivity })}>
                      {ACTIVITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <div className="flex flex-wrap gap-3 sm:col-span-3">
                    <button className="text-xs text-rust underline" onClick={() => confirm('Remove this copy from the book?') && deleteSource(s.id)}>Remove this copy</button>
                    {v.sources.length > 1 && <button className="text-xs text-rust underline" title="Move this copy to its own book" onClick={() => confirm('Treat this copy as a different book?') && splitSource(s.id)}>Not the same book</button>}
                  </div>
                </div>
              )}
              {s.library && <div className="mt-1 text-xs text-muted">{s.library}</div>}
              {evs.length > 0 && <div className="mt-1 text-xs text-muted">{evs.map((e) => `${e.type} ${e.date}`).join(' · ')}</div>}
              <div className="mt-1 text-[11px] text-muted/80">Source: {s.provenance}</div>
            </li>
          )
        })}
        {!v.sources.length && <li className="text-sm text-muted">Not linked to a service yet. Add where you have it.</li>}
      </ul>
      {adding && (
        <div className="card fade-in mt-2 grid grid-cols-2 gap-3 p-3">
          <label className={lbl}>Service
            <select className="field mt-1 !min-h-10 text-sm font-normal text-ink" value={svc} onChange={(e) => setSvc(e.target.value as SourceName)}>
              {SERVICES.map((x) => <option key={x} value={x}>{x === 'manual' ? 'I own it / bought it' : x === 'other' ? 'Somewhere else' : SERVICE_LABEL[x]}</option>)}</select></label>
          <label className={lbl}>Format
            <select className="field mt-1 !min-h-10 text-sm font-normal text-ink" value={fmt} onChange={(e) => setFmt(e.target.value as Format)}>
              {FORMATS.map((x) => <option key={x} value={x}>{FORMAT_LABEL[x]}</option>)}</select></label>
          <div className="col-span-2 flex items-center gap-3">
            <button className="btn btn-primary !min-h-10 text-sm" onClick={async () => { const ok = await addSource(v.book.id, { source: svc, format: fmt, activity: svc === 'audible' ? 'purchased' : svc === 'libby' || svc === 'hoopla' ? 'borrowed' : 'unknown' }); setMsg(ok ? '✓ Added' : 'You already have that copy listed.'); if (ok) setAdding(false) }}>Add</button>
            {msg && <span role="status" className="text-xs text-muted">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
