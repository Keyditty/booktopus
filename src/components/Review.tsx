import { useEffect, useMemo, useRef, useState } from 'react'
import { Cover } from './Cover'
import { applyMeta, enrichCandidates, lookupMeta } from '../lib/metadata'
import { commitImport, planImport, planOne, undoBatch } from '../lib/store'
import { splitAuthors } from '../lib/normalize'
import type { Book, Candidate, ImportBatch, ReviewCategory, ReviewItem } from '../types'

const CAT_LABEL: Record<ReviewCategory, string> = { new: 'New to your shelf', existing: 'Already on your shelf', possible: 'Possible duplicates', review: 'Please check these', unrecognized: 'Couldn’t read these' }
const CAT_ORDER: ReviewCategory[] = ['review', 'possible', 'unrecognized', 'new', 'existing']

export function Review({ candidates, books, adapter, label, notes, onDone, onCancel }: {
  candidates: Candidate[]; books: Book[]; adapter: string; label: string; notes?: string[]; onDone: () => void; onCancel: () => void
}) {
  const [phase, setPhase] = useState<'lookup' | 'review' | 'saving' | 'done'>('lookup')
  const [progress, setProgress] = useState<[number, number]>([0, candidates.length])
  const [items, setItems] = useState<ReviewItem[]>([])
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [undone, setUndone] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const cs = candidates.map((c) => ({ ...c, events: [...c.events] }))
      // dedupe first so the same book detected in many screenshots is only looked up once
      const uniq = planImport(cs, []).map((i) => ({ cand: i.candidate, n: i.detections }))
      await enrichCandidates(uniq.map((u) => u.cand), (d, t) => setProgress([d, t]))
      setItems(planImport(uniq.map((u) => u.cand), books).map((it, i) => ({ ...it, detections: uniq[i]?.n ?? it.detections })))
      setPhase('review')
    })()
  }, [candidates, books])

  const counts = useMemo(() => {
    const c: Record<ReviewCategory, number> = { new: 0, existing: 0, possible: 0, review: 0, unrecognized: 0 }
    items.forEach((i) => c[i.category]++)
    return c
  }, [items])
  const selected = items.filter((i) => i.include).length
  const patch = (id: string, p: Partial<ReviewItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)))

  async function recheck(it: ReviewItem, title: string, author: string) {
    const c: Candidate = { ...it.candidate, title, authors: splitAuthors(author), confidence: 0.9, coverUrl: undefined, synopsis: undefined, genres: [] }
    const m = await lookupMeta(c)
    applyMeta(c, m)
    const fresh = planOne(c, books, it.detections)
    // the user typed this: treat as intentional, so an unmatched lookup is not a reason to hold it back
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...fresh, id: it.id, include: true, category: fresh.category === 'review' || fresh.category === 'unrecognized' ? 'new' : fresh.category } : x)))
  }

  async function save() {
    setPhase('saving')
    const b = await commitImport(items, { adapter, label })
    setBatch(b); setPhase('done')
  }

  if (phase === 'lookup') return (
    <div className="card mx-auto max-w-xl p-8 text-center fade-in">
      <div className="text-4xl" aria-hidden>📚</div>
      <h2 className="mt-2 text-xl font-bold">Finding covers and details…</h2>
      <p className="mt-1 text-sm text-muted">{progress[0]} of {progress[1]} books checked</p>
      <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-mist"><div className="h-full bg-accent transition-all" style={{ width: `${progress[1] ? (progress[0] / progress[1]) * 100 : 0}%` }} /></div>
      <p className="mt-4 text-xs text-muted">Only book titles and authors are sent to Google Books and Open Library.</p>
    </div>
  )

  if (phase === 'done' && batch) return (
    <div className="card mx-auto max-w-xl p-8 text-center fade-in">
      <div className="text-4xl" aria-hidden>🎉</div>
      <h2 className="mt-2 text-xl font-bold">{undone ? 'Import undone' : 'Your shelf is updated'}</h2>
      {!undone && <p className="mt-2 text-muted">{batch.booksCreated} new book{batch.booksCreated === 1 ? '' : 's'} added{batch.booksMerged ? `, ${batch.booksMerged} already on your shelf were updated` : ''}.</p>}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button className="btn btn-primary" onClick={onDone}>See my bookshelf</button>
        {!undone && <button className="btn btn-ghost" onClick={async () => { await undoBatch(batch.id); setUndone(true) }}>Undo this import</button>}
      </div>
    </div>
  )

  const Stat = ({ n, l, c }: { n: number; l: string; c?: string }) => <div className="rounded-xl bg-mist/60 px-3 py-2 text-center"><div className={`text-xl font-bold ${c ?? ''}`}>{n}</div><div className="text-[11px] text-muted">{l}</div></div>
  const highConf = items.filter((i) => i.category === 'new' || i.category === 'existing').length

  return (
    <div className="mx-auto max-w-3xl fade-in">
      <h2 className="text-2xl font-bold">Check before adding</h2>
      <p className="text-sm text-muted">Nothing is saved until you press “Add”. {notes?.map((n) => ` ${n}`)}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat n={items.length} l="Books found" /><Stat n={counts.new} l="New" c="text-sage" /><Stat n={counts.existing} l="Already have" />
        <Stat n={counts.possible} l="Possible duplicates" c="text-gold" /><Stat n={counts.review} l="Need a look" c="text-rust" /><Stat n={counts.unrecognized} l="Unreadable" c="text-rust" />
      </div>
      <div className="sticky top-0 z-10 -mx-4 mt-4 flex flex-wrap items-center gap-2 bg-sea/90 px-4 py-3 backdrop-blur">
        <button className="btn btn-ghost" disabled={!highConf} onClick={() => setItems((xs) => xs.map((x) => (x.category === 'new' || x.category === 'existing' ? { ...x, include: true } : x)))}>Accept all confident matches ({highConf})</button>
        <button className="btn btn-primary ml-auto" disabled={!selected || phase === 'saving'} onClick={save}>{phase === 'saving' ? 'Saving…' : `Add ${selected} book${selected === 1 ? '' : 's'}`}</button>
        <button className="text-sm text-muted underline" onClick={onCancel}>Cancel</button>
      </div>
      {!items.length && <p className="card mt-4 p-6 text-center text-muted">No books were found. Try a different method, or check that the text contains titles.</p>}
      {CAT_ORDER.map((cat) => {
        const rows = items.filter((i) => i.category === cat)
        if (!rows.length) return null
        return (
          <section key={cat} className="mt-5">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{CAT_LABEL[cat]} ({rows.length})</h3>
              <button className="text-xs text-accent underline" onClick={() => setItems((xs) => xs.map((x) => (x.category === cat ? { ...x, include: !rows.every((r) => r.include) } : x)))}>{rows.every((r) => r.include) ? 'Clear all' : 'Select all'}</button>
            </div>
            <ul className="mt-2 space-y-2">
              {rows.map((it) => (
                <Row key={it.id} it={it} onToggle={() => patch(it.id, { include: !it.include })} onRecheck={(t, a) => recheck(it, t, a)}
                  onSeparate={() => patch(it.id, { category: 'new', matchBookId: undefined, include: true, reason: undefined })} onSame={() => patch(it.id, { category: 'existing', include: true, reason: undefined })} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Row({ it, onToggle, onRecheck, onSeparate, onSame }: { it: ReviewItem; onToggle: () => void; onRecheck: (t: string, a: string) => void; onSeparate: () => void; onSame: () => void }) {
  const c = it.candidate
  const [t, setT] = useState(c.title), [a, setA] = useState(c.authors.join(', '))
  useEffect(() => { setT(c.title); setA(c.authors.join(', ')) }, [c.title, c.authors])
  const dirty = t !== c.title || a !== c.authors.join(', ')
  return (
    <li className={`card flex gap-3 p-3 ${it.include ? '' : 'opacity-75'}`}>
      <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-accent)]" checked={it.include} onChange={onToggle} aria-label={`Include ${c.title}`} />
      <div className="w-12 shrink-0"><Cover title={c.title} author={c.authors[0]} url={c.coverUrl} /></div>
      <div className="min-w-0 flex-1">
        <input className="field !min-h-9 !py-1 font-semibold" value={t} onChange={(e) => setT(e.target.value)} aria-label="Title" />
        <input className="field mt-1 !min-h-9 !py-1 text-sm" value={a} placeholder="Author" onChange={(e) => setA(e.target.value)} aria-label="Author" />
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {c.enriched === 'matched' && <span className="text-sage">✓ matched online</span>}
          {it.detections > 1 && <span>seen {it.detections}×</span>}
          {c.status && <span>marked {c.status.replace('_', ' ')}</span>}
          {c.wantToRead && <span>want to read</span>}
          {c.format !== 'unknown' && <span>{c.format}</span>}
          {it.reason && <span className="text-rust">{it.reason}</span>}
          {it.category === 'existing' && it.matchTitle && <span>same as “{it.matchTitle}”</span>}
        </div>
        {it.category === 'possible' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-ghost !min-h-9 !py-1 text-xs" onClick={onSame}>Same book — combine</button>
            <button className="btn btn-ghost !min-h-9 !py-1 text-xs" onClick={onSeparate}>Different book</button>
          </div>
        )}
        {dirty && <button className="btn btn-primary mt-2 !min-h-9 !py-1 text-xs" onClick={() => onRecheck(t, a)}>Look this up again</button>}
      </div>
    </li>
  )
}
