import type { SearchMode } from '../lib/settings'

/** One search box, two jobs: look inside my library, or find any book. The toggle makes it obvious which one is active. */
export function SearchBar({ q, setQ, mode, setMode }: { q: string; setQ: (v: string) => void; mode: SearchMode; setMode: (m: SearchMode) => void }) {
  const web = mode === 'web'
  return (
    <div data-tour="search">
      <div className="mb-2 flex justify-center gap-2" role="radiogroup" aria-label="What to search">
        <button role="radio" aria-checked={!web} onClick={() => setMode('library')} className={`btn !min-h-9 !px-4 !py-1 text-sm ${!web ? 'btn-primary' : 'btn-ghost'}`}>📚 My library</button>
        <button role="radio" aria-checked={web} onClick={() => setMode('web')} className={`btn !min-h-9 !px-4 !py-1 text-sm ${web ? 'btn-primary' : 'btn-ghost'}`}>🌐 Find any book</button>
      </div>
      <div className="relative">
        <input type="search" className="field !rounded-full !pl-11" value={q} onChange={(e) => setQ(e.target.value)} aria-label={web ? 'Find any book' : 'Search your library'}
          placeholder={web ? 'Find any book: title, author or ISBN' : 'Search your library: title, author, narrator, series'} />
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>{web ? '🌐' : '🔍'}</span>
      </div>
    </div>
  )
}
