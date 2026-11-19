import { useEffect, useMemo, useRef, useState } from 'react'
import { Cover } from './Cover'
import { SeriesSheet } from './SeriesSheet'
import { addMeta, googleUrl } from '../lib/discover'
import { buildSeriesGroups, matchOwned, seriesKeyOf, type SeriesGroup } from '../lib/seriesTracker'
import { cachedSeries, findSeries, type SeriesResult } from '../lib/series'
import { db } from '../lib/db'
import { placeOnArm, setStatus, tagSeries } from '../lib/store'
import type { Book } from '../types'

/** Series groups for the library, enriched with any cached series lookups (no network). */
export function useSeriesGroups(books: Book[]): SeriesGroup[] {
  const [lookups, setLookups] = useState<Map<string, SeriesResult>>(new Map())
  const names = useMemo(() => [...new Set(books.map((b) => b.series?.trim()).filter((x): x is string => !!x))], [books])
  useEffect(() => {
    let on = true
    ;(async () => {
      const m = new Map<string, SeriesResult>()
      for (const n of names) { const r = await cachedSeries(n); if (r) m.set(seriesKeyOf(n), r) }
      if (on) setLookups(m)
    })()
    return () => { on = false }
  }, [names])
  return useMemo(() => buildSeriesGroups(books, lookups), [books, lookups])
}

function Dots({ g }: { g: SeriesGroup }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1" role="img" aria-label={`${g.finished} finished, ${g.owned - g.finished} on shelf unread, ${g.total - g.owned} not on shelf`}>
      {g.entries.slice(0, 40).map((e, i) => {
        const fin = e.owned && (e.owned.status === 'finished' || e.owned.readings.length > 0)
        return <span key={i} title={`${e.position ?? i + 1}. ${e.title}`} className={`h-3.5 w-3.5 rounded-full border-2 ${fin ? 'border-accent bg-accent' : e.owned ? 'border-gold' : 'border-dashed border-line'}`} />
      })}
    </div>
  )
}

export function SeriesCard({ g, books, onOpen, compact = false }: { g: SeriesGroup; books: Book[]; onOpen: (id: string) => void; compact?: boolean }) {
  const [sheet, setSheet] = useState(false)
  const [added, setAdded] = useState(false)
  const n = g.next
  const sizeText = g.totalKnown ? `${g.finished} of ${g.total} finished · ${g.owned} on your shelf` : `${g.finished} finished · ${g.owned} on your shelf`
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="serif text-lg font-bold leading-tight">{g.name}</h3><p className="text-xs text-muted">{sizeText}{g.state === 'complete' ? ' · ✓ Complete!' : ''}</p></div>
        <button className="shrink-0 text-xs text-accent underline" onClick={() => setSheet(true)}>All books</button>
      </div>
      <Dots g={g} />
      {n && g.state !== 'complete' && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-mist/60 p-2">
          <button className="w-11 shrink-0" onClick={() => n.owned && onOpen(n.owned.id)} disabled={!n.owned} aria-label={n.owned ? `Open ${n.title}` : n.title}><Cover title={n.title} author={n.authors[0]} url={n.coverUrl ?? n.owned?.coverUrl} /></button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">{g.state === 'not-started' ? 'Start with' : 'Next up'}{n.position != null ? ` · Book ${n.position}` : ''}</div>
            <div className="serif truncate font-semibold">{n.title}</div>
            <div className="text-xs text-muted">{n.owned ? 'On your shelf' : 'Not on your shelf yet'}</div>
            {!compact && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {n.owned ? <>
                  <button className="btn btn-primary !min-h-8 !px-3 !py-0.5 text-xs" onClick={() => setStatus(n.owned!.id, 'in_progress')}>📖 Start reading</button>
                  <button className="btn btn-ghost !min-h-8 !px-3 !py-0.5 text-xs" onClick={() => placeOnArm(n.owned!.id, 'queued')}>🐙 Up next</button>
                </> : <>
                  {n.authors.length > 0 || n.coverUrl ? <button className="btn btn-primary !min-h-8 !px-3 !py-0.5 text-xs" disabled={added} onClick={async () => { await addMeta({ title: n.title, authors: n.authors, coverUrl: n.coverUrl, year: n.year, genres: [], identifiers: {}, score: 1, provider: 'google' }, { want: true }); setAdded(true) }}>{added ? '✓ Added' : '＋ Want to read'}</button> : null}
                  <a className="btn btn-ghost !min-h-8 !px-3 !py-0.5 text-xs" href={googleUrl(`${g.name} ${n.title} book`)} target="_blank" rel="noopener noreferrer">🔎 Find it</a>
                </>}
              </div>
            )}
          </div>
        </div>
      )}
      {sheet && <SeriesSheet query={{ title: n?.title ?? g.name, series: g.name }} books={books} onClose={() => setSheet(false)} onOpen={(id) => { setSheet(false); onOpen(id) }} />}
    </div>
  )
}

/** The Series tab: every series on the shelf, how far along she is, and what to read next. */
export function SeriesView({ books, onOpen }: { books: Book[]; onOpen: (id: string) => void }) {
  const groups = useSeriesGroups(books)
  const [prog, setProg] = useState<{ done: number; total: number; found: number } | null>(null)
  const stop = useRef(false)
  const unknown = useMemo(() => books.filter((b) => !b.series).sort((a, b) => Number(b.status === 'finished') - Number(a.status === 'finished')), [books])

  async function findAll() {
    stop.current = false
    const todo: Book[] = []
    for (const b of unknown) { if (todo.length >= 40) break; if (!(await db.cache.get(`series-miss:${b.id}`))) todo.push(b) }
    let found = 0
    setProg({ done: 0, total: todo.length, found })
    for (let i = 0; i < todo.length && !stop.current; i++) {
      const b = todo[i]
      const o = await findSeries({ title: b.title, author: b.authors[0] })
      if (o.result) found += await tagSeries(o.result.books.flatMap((x) => { const own = matchOwned(x, books); return own ? [{ bookId: own.id, series: o.result!.name, seriesNumber: x.position }] : [] }))
      else await db.cache.put({ key: `series-miss:${b.id}`, value: true, at: Date.now() })
      setProg({ done: i + 1, total: todo.length, found })
      await new Promise((r) => setTimeout(r, 1200)) // be gentle: Hardcover allows ~60 requests a minute
    }
  }

  const sections: [string, SeriesGroup[]][] = [['Keep going', groups.filter((g) => g.state === 'in-progress')], ['Ready to start', groups.filter((g) => g.state === 'not-started')], ['Finished series', groups.filter((g) => g.state === 'complete')]]
  return (
    <div className="mx-auto max-w-2xl space-y-5 fade-in">
      <div><h2 className="text-2xl font-bold">Your series</h2><p className="text-sm text-muted">Which series you’re in, how far along you are, and what to read next.</p></div>
      {groups.length === 0 && <p className="card p-6 text-center text-muted">No series yet. Open a book and tap “📚 See the whole series”, or use the button below to check your whole shelf.</p>}
      {sections.map(([title, gs]) => gs.length > 0 && (
        <section key={title} aria-label={title}><h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title} ({gs.length})</h3><div className="space-y-3">{gs.map((g) => <SeriesCard key={g.key} g={g} books={books} onOpen={onOpen} />)}</div></section>
      ))}
      <section className="card p-4">
        <h3 className="font-bold">Find series for the rest of my shelf</h3>
        <p className="mt-1 text-xs text-muted">{unknown.length} book{unknown.length === 1 ? '' : 's'} aren’t in a series yet. This checks up to 40 of them online (about a minute) and saves any series it finds. Only titles and authors are sent.</p>
        <div className="mt-3 flex items-center gap-3">
          {!prog || prog.done >= prog.total ? <button className="btn btn-primary !min-h-10 text-sm" disabled={!unknown.length} onClick={findAll}>🔎 Check my shelf</button> : <button className="btn btn-ghost !min-h-10 text-sm" onClick={() => { stop.current = true }}>Stop</button>}
          {prog && <span role="status" className="text-xs text-muted">{prog.done >= prog.total ? `Done. Tagged ${prog.found} book${prog.found === 1 ? '' : 's'}.` : `Checked ${prog.done} of ${prog.total}… tagged ${prog.found}`}</span>}
        </div>
      </section>
    </div>
  )
}
