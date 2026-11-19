import { useEffect, useState } from 'react'
import { Cover } from './Cover'
import { deleteBook, mergeBooks, readAgain, setStatus, splitSource, updateBook } from '../lib/store'
import { FORMAT_LABEL, SERVICE_COLOR, SERVICE_LABEL, STATUS_LABEL, type BookView } from '../lib/shelves'
import type { ActivityEvent, Book } from '../types'

const ACTIVITY_LABEL = { purchased: 'Purchased', borrowed: 'Borrowed', returned: 'Returned', hold: 'On hold', available: 'Available', unknown: 'In library' } as const

export function BookDetail({ v, all, events, onClose }: { v: BookView; all: BookView[]; events: ActivityEvent[]; onClose: () => void }) {
  const b = v.book
  const [notes, setNotes] = useState(b.notes ?? '')
  const [editing, setEditing] = useState(false)
  const [mergeId, setMergeId] = useState('')
  useEffect(() => setNotes(b.notes ?? ''), [b.id, b.notes])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const patch = (p: Partial<Book>) => updateBook(b.id, p)
  const stBtn = (label: string, active: boolean, on: () => void, icon: string) => (
    <button onClick={on} aria-pressed={active} className={`btn !px-3 text-sm ${active ? 'btn-primary' : 'btn-ghost'}`}><span aria-hidden>{icon}</span>{label}</button>
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/50 fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-label={b.title}>
      <div className="sheet-in h-full w-full max-w-xl overflow-y-auto bg-sea shadow-2xl sm:rounded-l-3xl" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-sea/90 px-4 py-3 backdrop-blur">
          <button className="btn btn-ghost !min-h-10 !py-1.5 text-sm" onClick={onClose}>← Back to shelf</button>
          <button className="btn btn-ghost !min-h-10 !py-1.5 text-sm" onClick={() => patch({ favorite: !b.favorite })} aria-pressed={b.favorite}>{b.favorite ? '❤️ Favorite' : '🤍 Favorite'}</button>
        </div>

        <div className="px-5 pb-10">
          <div className="flex gap-5">
            <div className="w-32 shrink-0 sm:w-40"><Cover title={b.title} author={b.authors[0]} url={b.coverUrl} /></div>
            <div className="min-w-0 pt-1">
              <h2 className="text-2xl font-bold leading-tight">{b.title}</h2>
              {b.subtitle && <p className="serif mt-1 text-muted">{b.subtitle}</p>}
              <p className="mt-2 text-lg">{b.authors.join(', ') || <span className="text-muted">Author unknown</span>}</p>
              {b.narrator && <p className="text-sm text-muted">Narrated by {b.narrator}</p>}
              {b.series && <p className="mt-1 text-sm text-accent">{b.series}{b.seriesNumber ? ` · Book ${b.seriesNumber}` : ''}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.formats.map((f) => <span key={f} className="rounded-full bg-mist px-2.5 py-0.5 text-xs">{FORMAT_LABEL[f]}</span>)}
                {b.genres.slice(0, 3).map((g) => <span key={g} className="rounded-full border border-mist px-2.5 py-0.5 text-xs text-muted">{g}</span>)}
                {b.year ? <span className="px-1 py-0.5 text-xs text-muted">{b.year}</span> : null}
              </div>
            </div>
          </div>

          <section className="mt-6" aria-label="Reading status">
            <div className="flex flex-wrap gap-2">
              {stBtn('Want to read', b.wantToRead, () => patch({ wantToRead: !b.wantToRead }), '🔖')}
              {stBtn('Reading', b.status === 'in_progress', () => setStatus(b.id, b.status === 'in_progress' ? 'unknown' : 'in_progress'), '📖')}
              {stBtn('Finished', b.status === 'finished', () => setStatus(b.id, b.status === 'finished' ? 'unknown' : 'finished'), '✅')}
              {stBtn('Didn’t finish', b.status === 'dnf', () => setStatus(b.id, b.status === 'dnf' ? 'unknown' : 'dnf'), '⏸')}
            </div>
            <p className="mt-2 text-xs text-muted">
              {b.status === 'unknown' ? 'Not marked yet — tap one above. Borrowing or buying a book doesn’t count as reading it.' : `Status: ${STATUS_LABEL[b.status]}${b.statusSource === 'user' ? '' : ' (from an import — tap to confirm or change)'}`}
            </p>
            {v.sources.some((s) => s.completionHint) && b.statusSource !== 'user' && (
              <p className="mt-1 text-xs text-muted">Source note: {v.sources.find((s) => s.completionHint)!.completionHint!.note}</p>
            )}
          </section>

          <section className="mt-5">
            <div className="flex items-center gap-1" role="radiogroup" aria-label="My rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={b.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => patch({ rating: b.rating === n ? undefined : n })}
                  className={`h-11 w-9 text-3xl leading-none ${(b.rating ?? 0) >= n ? 'text-gold' : 'text-mist'}`}>★</button>
              ))}
              <span className="ml-2 text-sm text-muted">{b.rating ? 'Your rating' : 'Tap to rate'}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-muted">Started<input type="date" className="field mt-1 font-normal text-ink" value={b.startedAt ?? ''} onChange={(e) => patch({ startedAt: e.target.value || undefined })} /></label>
              <label className="text-xs font-semibold text-muted">Finished<input type="date" className="field mt-1 font-normal text-ink" value={b.finishedAt ?? ''} onChange={(e) => patch({ finishedAt: e.target.value || undefined })} /></label>
            </div>
            {b.status === 'finished' && <button className="mt-2 text-sm text-accent underline" onClick={() => readAgain(b.id)}>Read / listen again</button>}
            {b.readings.length > 0 && <p className="mt-2 text-xs text-muted">Previous read-throughs: {b.readings.map((r) => [r.startedAt, r.finishedAt].filter(Boolean).join(' → ') || 'undated').join('; ')}</p>}
            <label className="mt-3 block text-xs font-semibold text-muted">My notes
              <textarea className="field mt-1 min-h-24 font-normal text-ink" value={notes} placeholder="Thoughts, quotes, who recommended it…" onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (b.notes ?? '') && patch({ notes })} />
            </label>
          </section>

          {b.synopsis && <section className="mt-6"><h3 className="text-sm font-bold uppercase tracking-wide text-muted">About this book</h3><p className="serif mt-1 leading-relaxed">{b.synopsis}</p></section>}

          <section className="mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Where you have it</h3>
            <ul className="mt-2 space-y-2">
              {v.sources.map((s) => {
                const evs = events.filter((e) => e.sourceRecordId === s.id && e.date).sort((a, c) => a.date!.localeCompare(c.date!))
                return (
                  <li key={s.id} className="card p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: SERVICE_COLOR[s.source] }} />
                      <strong>{SERVICE_LABEL[s.source]}</strong><span className="text-muted">· {FORMAT_LABEL[s.format]} · {ACTIVITY_LABEL[s.activity]}</span>
                      {v.sources.length > 1 && <button className="ml-auto text-xs text-rust underline" title="Move this copy to its own book" onClick={() => confirm('Treat this copy as a different book?') && splitSource(s.id)}>Not the same book</button>}
                    </div>
                    {s.library && <div className="mt-1 text-xs text-muted">{s.library}</div>}
                    {evs.length > 0 && <div className="mt-1 text-xs text-muted">{evs.map((e) => `${e.type} ${e.date}`).join(' · ')}</div>}
                    <div className="mt-1 text-[11px] text-muted/80">Imported from: {s.provenance}</div>
                  </li>
                )
              })}
              {!v.sources.length && <li className="text-sm text-muted">No service linked.</li>}
            </ul>
          </section>

          <section className="mt-6 border-t border-mist pt-4">
            <button className="text-sm text-accent underline" onClick={() => setEditing(!editing)}>{editing ? 'Hide editing' : 'Edit details, merge or delete'}</button>
            {editing && (
              <div className="fade-in mt-3 space-y-3">
                {([['title', 'Title'], ['subtitle', 'Subtitle'], ['narrator', 'Narrator'], ['series', 'Series'], ['coverUrl', 'Cover image address']] as const).map(([k, l]) => (
                  <label key={k} className="block text-xs font-semibold text-muted">{l}<input className="field mt-1 font-normal text-ink" defaultValue={(b[k] as string) ?? ''} onBlur={(e) => e.target.value !== ((b[k] as string) ?? '') && patch({ [k]: e.target.value || undefined } as Partial<Book>)} /></label>
                ))}
                <label className="block text-xs font-semibold text-muted">Author(s), separated by semicolons<input className="field mt-1 font-normal text-ink" defaultValue={b.authors.join('; ')} onBlur={(e) => patch({ authors: e.target.value.split(';').map((x) => x.trim()).filter(Boolean) })} /></label>
                <label className="block text-xs font-semibold text-muted">Genres, separated by semicolons<input className="field mt-1 font-normal text-ink" defaultValue={b.genres.join('; ')} onBlur={(e) => patch({ genres: e.target.value.split(';').map((x) => x.trim()).filter(Boolean) })} /></label>
                <div className="flex gap-2">
                  <select className="field" value={mergeId} onChange={(e) => setMergeId(e.target.value)} aria-label="Merge with another book">
                    <option value="">Same as another book on my shelf…</option>
                    {all.filter((x) => x.book.id !== b.id).sort((a, c) => a.book.title.localeCompare(c.book.title)).map((x) => <option key={x.book.id} value={x.book.id}>{x.book.title} — {x.book.authors[0]}</option>)}
                  </select>
                  <button className="btn btn-ghost" disabled={!mergeId} onClick={async () => { await mergeBooks(b.id, mergeId); setMergeId('') }}>Combine</button>
                </div>
                <button className="btn btn-ghost !border-rust text-rust" onClick={async () => { if (confirm(`Remove “${b.title}” from your library?`)) { await deleteBook(b.id); onClose() } }}>Delete this book</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
