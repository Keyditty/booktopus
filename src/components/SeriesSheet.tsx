import { useEffect, useMemo, useState } from 'react'
import { Cover } from './Cover'
import { findSeries, type FindSeriesOutcome, type SeriesBook, type SeriesQuery } from '../lib/series'
import { addMeta, googleUrl } from '../lib/discover'
import { bestMatch, AUTO_MERGE } from '../lib/match'
import type { Book } from '../types'

/** Shows every book in a series, marks the ones already on the shelf, and lets her add the missing ones in a tap. */
export function SeriesSheet({ query, books, onClose, onOpen }: { query: SeriesQuery; books: Book[]; onClose: () => void; onOpen?: (id: string) => void }) {
  const [out, setOut] = useState<FindSeriesOutcome | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  useEffect(() => { let on = true; findSeries(query).then((o) => on && setOut(o)); return () => { on = false } }, [query])

  const rows = useMemo(() => (out?.result?.books ?? []).map((b) => {
    const hit = bestMatch({ title: b.title, authors: b.authors, identifiers: {} }, books)
    // series data from some sources has no author names, so an exact title match (0.78) counts as owned here
    return { b, owned: hit && (hit.score >= AUTO_MERGE || (!b.authors.length && hit.score >= 0.78)) ? (hit.item as Book) : undefined }
  }), [out, books])
  const missing = rows.filter((r) => !r.owned && !added.has(r.b.title))
  const add = async (b: SeriesBook) => { await addMeta({ title: b.title, authors: b.authors, coverUrl: b.coverUrl, year: b.year, genres: [], identifiers: {}, score: 1, provider: 'google' }, { want: true }); setAdded((s) => new Set(s).add(b.title)) }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 fade-in sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Whole series">
      <div className="sheet-in card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl" style={{ background: 'var(--c-sea)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{out?.result ? out.result.name : 'Finding the series…'}</h3><button className="text-sm text-accent underline" onClick={onClose}>Close</button></div>
        {!out && <p className="mt-3 text-sm text-muted">Looking it up…</p>}
        {out && !out.result && (
          <div className="mt-3 text-sm">
            <p>Couldn’t find a series for “{query.series ?? query.title}”.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{out.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <a className="btn btn-ghost mt-3 !min-h-9 text-xs" href={googleUrl(`${query.series ?? query.title} book series in order`)} target="_blank" rel="noopener noreferrer">🔎 Search Google for the series order</a>
          </div>
        )}
        {out?.result && (
          <>
            <p className="mt-1 text-xs text-muted">{rows.length} books · {rows.filter((r) => r.owned).length} on your shelf · data from {out.result.provider === 'hardcover' ? 'Hardcover' : 'Inventaire'}</p>
            {missing.length > 1 && <button className="btn btn-primary mt-3 !min-h-10 text-sm" onClick={async () => { for (const r of missing) await add(r.b) }}>＋ Add the {missing.length} missing books to Want to Read</button>}
            <ol className="mt-3 space-y-2">
              {rows.map(({ b, owned }, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted">{b.position ?? i + 1}</span>
                  <span className="w-10 shrink-0"><Cover title={b.title} author={b.authors[0]} url={b.coverUrl} /></span>
                  <span className="min-w-0 flex-1"><span className="serif block truncate text-sm font-semibold">{b.title}</span><span className="block truncate text-xs text-muted">{b.authors.join(', ')}{b.year ? ` · ${b.year}` : ''}</span></span>
                  {owned ? <button className="text-xs text-sage underline" onClick={() => onOpen?.(owned.id)}>✓ On shelf</button>
                    : added.has(b.title) ? <span className="text-xs text-sage">✓ Added</span>
                    : <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" onClick={() => add(b)}>＋ Want</button>}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
