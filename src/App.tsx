import { useEffect, useMemo, useState } from 'react'
import { BookCard } from './components/BookCard'
import { BookDetail } from './components/BookDetail'
import { FilterBar } from './components/FilterBar'
import { ImportFlow, type ImportKind } from './components/ImportFlow'
import { Octopus } from './components/Octopus'
import { SeaFx } from './components/Bubbles'
import { History, SettingsView, Stats } from './components/Secondary'
import { useLibrary } from './lib/useLibrary'
import { getSettings, saveSettings, type ThemeName } from './lib/settings'
import { NO_FILTERS, SHELVES, applyAll, inShelf, type Filters, type ShelfId, type SortKey } from './lib/shelves'
import { loadSampleBooks } from './lib/sample'

type View = 'shelf' | 'import' | 'history' | 'settings' | 'stats'
const VIEWS: View[] = ['shelf', 'import', 'history', 'settings', 'stats']
const readHash = (): View => { const h = location.hash.replace('#', '') as View; return VIEWS.includes(h) ? h : 'shelf' }

export default function App() {
  const { data, views, loading } = useLibrary()
  const [view, setViewState] = useState<View>(readHash())
  const [importKind, setImportKind] = useState<ImportKind>('hub')
  const [prefill, setPrefill] = useState('')
  const [shelf, setShelf] = useState<ShelfId>('all')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('added')
  const [openId, setOpenId] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(getSettings().theme)

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { const h = () => setViewState(readHash()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  const go = (v: View, kind: ImportKind = 'hub', pre = '') => { setMenu(false); setOpenId(null); if (v === 'import') { setImportKind(kind); setPrefill(pre) } location.hash = v === 'shelf' ? '' : v; setViewState(v) }
  const switchTheme = (t: ThemeName) => { setTheme(t); saveSettings({ theme: t }) }

  const shown = useMemo(() => applyAll(views, shelf, q, filters, sort), [views, shelf, q, filters, sort])
  const counts = useMemo(() => Object.fromEntries(SHELVES.map((s) => [s.id, views.filter((v) => inShelf(v, s.id)).length])), [views])
  const open = openId ? views.find((v) => v.book.id === openId) : undefined
  const searching = q.trim().length > 0
  const filtering = Object.values(filters).some(Boolean)
  const showOctopus = !loading && views.length > 0 && !searching && !filtering && (shelf === 'all' || shelf === 'current')

  return (
    <>
      <SeaFx />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
        <header className="flex items-center gap-3">
          <button onClick={() => go('shelf')} className="flex items-center gap-3 text-left" aria-label="Booktopus home">
            <img src="./icon.svg" alt="" className="h-11 w-11 rounded-xl shadow" />
            <span><span className="block font-display text-xl font-bold leading-none tracking-wide sm:text-3xl">Booktopus</span><span className="serif text-sm italic text-muted">Toni’s underwater library</span></span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-primary whitespace-nowrap" onClick={() => go('import')}><span aria-hidden>＋</span> Add<span className="hidden sm:inline"> books</span></button>
            <div className="relative">
              <button className="btn btn-ghost !px-3" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
              {menu && (
                <div className="card fade-in absolute right-0 z-30 mt-2 w-56 overflow-hidden py-1 text-sm shadow-lg" style={{ background: 'var(--c-sea)' }}>
                  <button className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => go('import', 'manual')}>Add one book by hand</button>
                  {([['stats', 'Reading stats'], ['history', 'Import history'], ['settings', 'Settings & backup']] as const).map(([v, l]) => <button key={v} className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => go(v)}>{l}</button>)}
                  <button className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => { switchTheme(theme === 'deep' ? 'lagoon' : 'deep'); setMenu(false) }}>{theme === 'deep' ? '🏝️ Sunlit Lagoon colors' : '🌌 Deep Sea colors'}</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {view === 'shelf' && (
          <main className="mt-5">
            <div className="relative">
              <input type="search" className="field !rounded-full !pl-11" placeholder="Search title, author, narrator, series" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your library" />
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>🔍</span>
            </div>
            {showOctopus && <Octopus views={views} allViews={views} onOpen={setOpenId} />}
            <nav className="scroll-x -mx-4 mt-5 flex gap-2 px-4 sm:mx-0 sm:px-0" aria-label="Shelves">
              {SHELVES.map((s) => (
                <button key={s.id} onClick={() => setShelf(s.id)} aria-current={shelf === s.id} title={s.label}
                  className={`btn shrink-0 !min-h-10 !py-1.5 text-sm ${shelf === s.id ? 'btn-primary' : 'btn-ghost'}`}>{s.short} <span className="opacity-70">{counts[s.id] ?? 0}</span></button>
              ))}
            </nav>
            {!loading && views.length > 0 && <div className="mt-3"><FilterBar views={views} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} /></div>}

            {loading ? <p className="mt-16 text-center text-muted">Diving in…</p>
              : views.length === 0 ? <Welcome onImport={() => go('import')} onManual={() => go('import', 'manual')} />
              : shown.length === 0 ? (
                <div className="mt-14 text-center fade-in">
                  <p className="text-muted">{searching ? `Nothing matches “${q}”.` : 'Nothing on this shelf yet.'}</p>
                  {searching && <button className="btn btn-primary mt-4" onClick={() => go('import', 'manual', q)}>Add “{q}” by hand</button>}
                </div>
              ) : (
                <>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <h2 className="serif text-lg text-muted">{searching ? `Results for “${q}”` : SHELVES.find((s) => s.id === shelf)!.label} <span className="text-sm">· {shown.length}</span></h2>
                    <button className="text-sm text-accent underline" onClick={() => go('import', 'manual')}>＋ Add a book by hand</button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-x-1 gap-y-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                    {shown.map((v) => <BookCard key={v.book.id} v={v} onOpen={() => setOpenId(v.book.id)} />)}
                  </div>
                </>
              )}
          </main>
        )}

        {view !== 'shelf' && (
          <main className="mt-6">
            <button className="mb-4 text-sm text-accent underline" onClick={() => go('shelf')}>← My bookshelf</button>
            {view === 'import' && <ImportFlow kind={importKind} setKind={setImportKind} books={data?.books ?? []} onDone={() => go('shelf')} prefill={prefill} />}
            {view === 'history' && <History batches={data?.batches ?? []} />}
            {view === 'settings' && <SettingsView bookCount={views.length} onChanged={() => go('shelf')} onTheme={switchTheme} />}
            {view === 'stats' && <Stats views={views} onOpen={(id) => { go('shelf'); setOpenId(id) }} />}
          </main>
        )}

        {open && <BookDetail v={open} all={views} events={data?.events.filter((e) => e.bookId === open.book.id) ?? []} onClose={() => setOpenId(null)} />}
      </div>
    </>
  )
}

function Welcome({ onImport, onManual }: { onImport: () => void; onManual: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="card fade-in mx-auto mt-10 max-w-xl p-8 text-center">
      <div className="text-5xl" aria-hidden>🐙</div>
      <h2 className="mt-3 text-2xl font-bold">Welcome, Toni</h2>
      <p className="serif mt-2 text-lg text-muted">Your octopus has eight arms and an empty shelf. Bring in the books you already have — no typing them all in.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button className="btn btn-primary" onClick={onImport}>Add my books</button>
        <button className="btn btn-ghost" onClick={onManual}>Add one by hand</button>
        <button className="btn btn-ghost" disabled={busy} onClick={async () => { setBusy(true); await loadSampleBooks() }}>Try sample books</button>
      </div>
    </div>
  )
}
