import { useEffect, useMemo, useState } from 'react'
import { Cover } from './Cover'
import { SeriesSheet } from './SeriesSheet'
import { searchBooks, type Meta } from '../lib/metadata'
import { addMeta, googleUrl } from '../lib/discover'
import { AUTO_MERGE, bestMatch } from '../lib/match'
import type { Book } from '../types'

/** "Find books": look up any book in the world (title, author or ISBN), then add it, see its series, or search the web. */
export function FindBooks({ q, books, onOpen }: { q: string; books: Book[]; onOpen: (id: string) => void }) {
  const [res, setRes] = useState<Meta[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<Record<string, 'want' | 'own'>>({})
  const [series, setSeries] = useState<Meta | null>(null)
  const query = q.trim()

  useEffect(() => {
    if (query.length < 2) { setRes(null); return }
    setBusy(true)
    let on = true
    const t = setTimeout(async () => { const r = await searchBooks(query, 18); if (on) { setRes(r); setBusy(false) } }, 500)
    return () => { on = false; clearTimeout(t) }
  }, [query])

  const rows = useMemo(() => (res ?? []).map((m) => { const hit = bestMatch({ title: m.title, authors: m.authors, identifiers: m.identifiers }, books); return { m, owned: hit && hit.score >= AUTO_MERGE ? (hit.item as Book) : undefined } }), [res, books])
  const key = (m: Meta) => m.title + '|' + m.authors[0]

  return (
    <div className="mx-auto max-w-2xl fade-in">
      <h2 className="text-xl font-bold">Find books</h2>
      <p className="text-sm text-muted">Searching every book, not just yours. Try a title, an author, or an ISBN.</p>
      {query.length < 2 && <p className="card mt-6 p-6 text-center text-muted">Type at least two letters above to search.</p>}
      {busy && <p className="mt-6 text-center text-muted">Searching…</p>}
      {!busy && res && !res.length && (
        <div className="card mt-6 p-6 text-center">
          <p className="text-muted">No results for “{query}”. You may be offline, or the book may have a different spelling.</p>
          <a className="btn btn-ghost mt-3" href={googleUrl(`${query} book`)} target="_blank" rel="noopener noreferrer">🔎 Search Google instead</a>
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {rows.map(({ m, owned }) => {
          const k = key(m), st = added[k]
          return (
            <li key={k} className="card flex gap-3 p-3">
              <span className="w-14 shrink-0"><Cover title={m.title} author={m.authors[0]} url={m.coverUrl} /></span>
              <div className="min-w-0 flex-1">
                <div className="serif font-semibold leading-tight">{m.title}</div>
                <div className="text-sm text-muted">{m.authors.join(', ') || 'Unknown author'}{m.year ? ` · ${m.year}` : ''}</div>
                {m.genres.length > 0 && <div className="mt-0.5 text-xs text-muted">{m.genres.slice(0, 3).join(' · ')}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {owned ? <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" onClick={() => onOpen(owned.id)}>✓ On your shelf. Open</button>
                    : st ? <span className="text-xs text-sage">✓ Added{st === 'want' ? ' to Want to Read' : ''}</span>
                    : <>
                      <button className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" onClick={async () => { await addMeta(m, { want: true }); setAdded((a) => ({ ...a, [k]: 'want' })) }}>＋ Want to read</button>
                      <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" onClick={async () => { await addMeta(m, { want: false }); setAdded((a) => ({ ...a, [k]: 'own' })) }}>＋ I have it</button>
                    </>}
                  <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" onClick={() => setSeries(m)}>📚 Series</button>
                  <a className="text-xs text-accent underline" href={googleUrl(`${m.title} ${m.authors[0] ?? ''}`)} target="_blank" rel="noopener noreferrer">Google ↗</a>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {series && <SeriesSheet query={{ title: series.title, author: series.authors[0] }} books={books} onClose={() => setSeries(null)} onOpen={(id) => { setSeries(null); onOpen(id) }} />}
    </div>
  )
}
