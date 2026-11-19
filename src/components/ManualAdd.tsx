import { useEffect, useState } from 'react'
import { Cover } from './Cover'
import { applyMeta, lookupMeta, searchBooks, type Meta } from '../lib/metadata'
import { commitImport, planOne, undoBatch } from '../lib/store'
import { splitAuthors } from '../lib/normalize'
import { getSettings } from '../lib/settings'
import type { Book, Candidate, Format, ImportBatch, ReviewItem, SourceName } from '../types'

const WHERE: [string, SourceName, string][] = [['audible', 'audible', 'Audible'], ['libby', 'libby', 'Libby'], ['hoopla', 'hoopla', 'Hoopla'], ['own', 'manual', 'I own it / bought it'], ['other', 'manual', 'Somewhere else']]
const STATUS: [string, string, (c: Candidate) => void][] = [
  ['none', 'Not marked', () => {}],
  ['want', 'Want to read', (c) => { c.wantToRead = true }],
  ['reading', 'Reading now', (c) => { c.status = 'in_progress' }],
  ['finished', 'Finished', (c) => { c.status = 'finished' }],
]

export function ManualAdd({ books, prefill, onDone }: { books: Book[]; prefill?: string; onDone: () => void }) {
  const [title, setTitle] = useState(prefill ?? '')
  const [author, setAuthor] = useState('')
  const [narrator, setNarrator] = useState('')
  const [format, setFormat] = useState<Format>('audiobook')
  const [where, setWhere] = useState('audible')
  const [series, setSeries] = useState('')
  const [seriesNo, setSeriesNo] = useState('')
  const [status, setStatus] = useState('none')
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [picked, setPicked] = useState<Meta | null>(null)
  const [sugg, setSugg] = useState<Meta[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<{ item: ReviewItem } | null>(null)
  const [done, setDone] = useState<ImportBatch | null>(null)
  const [undone, setUndone] = useState(false)

  // as she types a few words, offer matching books to tap (fills in author + cover)
  useEffect(() => {
    if (picked || title.trim().length < 3) { setSugg([]); return }
    setSearching(true)
    const t = setTimeout(async () => { const r = await searchBooks(title); setSugg(r); setSearching(false) }, 600)
    return () => clearTimeout(t)
  }, [title, picked])

  function pick(m: Meta) {
    setPicked(m); setTitle(m.title); setAuthor(m.authors.join(', ')); setSugg([])
  }

  function build(): Candidate {
    const [, source] = WHERE.find((w) => w[0] === where)!
    const c: Candidate = {
      title: title.trim(), subtitle: picked?.subtitle, authors: splitAuthors(author), narrator: narrator.trim() || undefined,
      series: series.trim() || undefined, seriesNumber: parseFloat(seriesNo) || undefined,
      format, source, identifiers: { ...(picked?.identifiers ?? {}) }, activity: source === 'audible' ? 'purchased' : 'unknown', events: [],
      rating: rating || undefined, notes: notes.trim() || undefined, coverUrl: picked?.coverUrl, synopsis: picked?.synopsis, year: picked?.year, genres: picked?.genres,
      confidence: 1, provenance: 'Added by hand', enriched: picked ? 'matched' : undefined,
    }
    STATUS.find((s) => s[0] === status)![2](c)
    return c
  }

  async function save(forced?: 'merge' | 'separate') {
    if (!title.trim()) return
    setBusy(true)
    try {
      const c = build()
      if (!picked && getSettings().lookupOnline) { try { const m = await lookupMeta(c); if (m && m.score >= 0.85) { const keep = c.title; applyMeta(c, m); c.title = keep } } catch { /* offline: fine */ } }
      c.confidence = 1
      const item = planOne(c, books)
      if ((item.category === 'existing' || item.category === 'possible') && !forced) { setConflict({ item }); return }
      const final: ReviewItem = forced === 'separate' ? { ...item, category: 'possible', matchBookId: undefined, include: true } : { ...item, include: true, category: item.matchBookId ? item.category : 'new' }
      setDone(await commitImport([final], { adapter: 'manual', label: `Added “${c.title}” by hand` }))
      setConflict(null)
    } finally { setBusy(false) }
  }

  function reset() { setTitle(''); setAuthor(''); setNarrator(''); setSeries(''); setSeriesNo(''); setStatus('none'); setRating(0); setNotes(''); setPicked(null); setDone(null); setUndone(false); setConflict(null) }

  if (done) return (
    <div className="card fade-in mx-auto max-w-xl p-8 text-center">
      <div className="text-4xl" aria-hidden>🐙</div>
      <h2 className="mt-2 text-xl font-bold">{undone ? 'Removed' : done.booksCreated ? 'Added to your shelf' : 'Added to the book you already had'}</h2>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button className="btn btn-primary" onClick={reset}>Add another book</button>
        <button className="btn btn-ghost" onClick={onDone}>See my bookshelf</button>
        {!undone && <button className="btn btn-ghost" onClick={async () => { await undoBatch(done.id); setUndone(true) }}>Undo</button>}
      </div>
    </div>
  )

  const lbl = 'block text-xs font-semibold text-muted'
  return (
    <div className="mx-auto max-w-xl fade-in">
      <h2 className="text-2xl font-bold">Add one book by hand</h2>
      <p className="mt-1 text-sm text-muted">Type a few words of the title and tap the right book. We’ll fill in the author and cover.</p>

      <div className="card mt-4 space-y-4 p-4">
        <div>
          <label className={lbl} htmlFor="m-title">Title</label>
          <input id="m-title" className="field mt-1" value={title} autoFocus autoComplete="off" placeholder="e.g. Project Hail Mary" onChange={(e) => { setTitle(e.target.value); setPicked(null) }} />
          {searching && <p className="mt-1 text-xs text-muted">Looking for matches…</p>}
          {sugg.length > 0 && (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Matching books">
              {sugg.map((m, i) => (
                <li key={i}><button className="flex w-full items-center gap-3 p-2 text-left hover:bg-mist" onClick={() => pick(m)}>
                  <span className="w-9 shrink-0"><Cover title={m.title} author={m.authors[0]} url={m.coverUrl} /></span>
                  <span className="min-w-0"><span className="serif block truncate font-semibold">{m.title}</span><span className="block truncate text-xs text-muted">{m.authors.join(', ') || 'Unknown author'}{m.year ? ` · ${m.year}` : ''}</span></span>
                </button></li>
              ))}
            </ul>
          )}
          {picked && <p className="mt-1 text-xs text-sage">✓ Picked a match — cover and description will be added.</p>}
        </div>
        <div><label className={lbl} htmlFor="m-author">Author</label><input id="m-author" className="field mt-1" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} htmlFor="m-format">Format</label>
            <select id="m-format" className="field mt-1" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              <option value="audiobook">Audiobook</option><option value="ebook">Ebook</option><option value="print">Print book</option><option value="comic">Comic / graphic novel</option>
            </select></div>
          <div><label className={lbl} htmlFor="m-where">Where is it from?</label>
            <select id="m-where" className="field mt-1" value={where} onChange={(e) => setWhere(e.target.value)}>{WHERE.map(([k, , l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        {format === 'audiobook' && <div><label className={lbl} htmlFor="m-narr">Narrator</label><input id="m-narr" className="field mt-1" value={narrator} onChange={(e) => setNarrator(e.target.value)} placeholder="Optional" /></div>}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className={lbl} htmlFor="m-series">Series</label><input id="m-series" className="field mt-1" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="Optional" /></div>
          <div><label className={lbl} htmlFor="m-sno">Book #</label><input id="m-sno" className="field mt-1" inputMode="decimal" value={seriesNo} onChange={(e) => setSeriesNo(e.target.value)} /></div>
        </div>
        <fieldset><legend className={lbl}>Where are you with it?</legend>
          <div className="mt-1 flex flex-wrap gap-2">{STATUS.map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className={`btn !min-h-10 !py-1.5 text-sm ${status === k ? 'btn-primary' : 'btn-ghost'}`}>{l}</button>)}</div></fieldset>
        <div><span className={lbl}>My rating</span>
          <div className="flex items-center" role="radiogroup" aria-label="My rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(rating === n ? 0 : n)} className={`h-11 w-9 text-3xl leading-none ${rating >= n ? 'text-gold' : 'text-mist'}`}>★</button>)}</div></div>
        <div><label className={lbl} htmlFor="m-notes">Notes</label><textarea id="m-notes" className="field mt-1 min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
      </div>

      {conflict && (
        <div className="card mt-4 border-gold p-4" role="alert">
          <p className="font-semibold">“{conflict.item.matchTitle}” looks like it’s already on your shelf.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => save('merge')}>Same book — add this copy to it</button>
            <button className="btn btn-ghost" onClick={() => save('separate')}>No, it’s a different book</button>
            <button className="btn btn-ghost" onClick={() => setConflict(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end"><button className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => save()}>{busy ? 'Adding…' : 'Add to my shelf'}</button></div>
    </div>
  )
}
