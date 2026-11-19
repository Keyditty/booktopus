import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookCard } from './components/BookCard'
import { BookDetail } from './components/BookDetail'
import { FilterBar } from './components/FilterBar'
import { ImportFlow, type ImportKind } from './components/ImportFlow'
import { Home } from './components/Home'
import { FindBooks } from './components/FindBooks'
import { SearchBar } from './components/SearchBar'
import { Tour } from './components/Tour'
import { SeaFx } from './components/Bubbles'
import { History, SettingsView } from './components/Secondary'
import { Reef } from './components/Reef'
import { SeriesView } from './components/SeriesView'
import { computeStats, diffMessage } from './lib/gamify'
import { useLibrary } from './lib/useLibrary'
import { getSettings, possessive, saveSettings, type SearchMode, type ThemeName } from './lib/settings'
import { NO_FILTERS, SHELVES, applyAll, inShelf, type Filters, type ShelfId, type SortKey } from './lib/shelves'

type View = 'home' | 'shelf' | 'find' | 'series' | 'import' | 'history' | 'settings' | 'stats'
const VIEWS: View[] = ['shelf', 'find', 'series', 'import', 'history', 'settings', 'stats']
/** 'shelf' is the Library tab (#library); the default screen with no hash is Home. */
const readHash = (): View => { const h = location.hash.replace('#', ''); return h === 'library' ? 'shelf' : VIEWS.includes(h as View) ? (h as View) : 'home' }

export default function App() {
  const { data, views, loading, error: storageError } = useLibrary()
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
  const [name, setNameState] = useState(getSettings().ownerName)
  const [goals, setGoalsState] = useState({ yearly: getSettings().yearlyGoal, monthly: getSettings().monthlyGoal })
  const setGoals = (g: { yearly: number; monthly: number }) => { setGoalsState(g); saveSettings({ yearlyGoal: g.yearly, monthlyGoal: g.monthly }) }
  const [mode, setModeState] = useState<SearchMode>(getSettings().searchMode)
  const [tour, setTour] = useState(!getSettings().tourDone)
  const [toast, setToast] = useState<string | null>(null)
  const prevStats = useRef<ReturnType<typeof computeStats> | null>(null)
  const setName = (n: string) => { const v = n.trim() || 'Reader'; setNameState(v); saveSettings({ ownerName: v }) }

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { document.title = `Booktopus · ${possessive(name)} library` }, [name])
  useEffect(() => { const h = () => setViewState(readHash()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  const go = (v: View, kind: ImportKind = 'hub', pre = '') => { setMenu(false); setOpenId(null); if (v === 'import') { setImportKind(kind); setPrefill(pre) } location.hash = v === 'home' ? '' : v === 'shelf' ? 'library' : v; setViewState(v) }
  const switchTheme = (t: ThemeName) => { setTheme(t); saveSettings({ theme: t }) }
  const setMode = (m: SearchMode) => { setModeState(m); saveSettings({ searchMode: m }); if (q.trim()) go(m === 'web' ? 'find' : 'shelf') }
  const onSearch = (v: string) => { setQ(v); if (!v.trim()) return; if (mode === 'web' && view !== 'find') go('find'); if (mode === 'library' && (view === 'home' || view === 'find')) go('shelf') }
  const finishTour = (goAdd: boolean) => { setTour(false); saveSettings({ tourDone: true }); if (goAdd) go('import') }
  const goHomeForTour = useCallback(() => { if (readHash() !== 'home') { location.hash = ''; setViewState('home') } }, [])

  const shown = useMemo(() => applyAll(views, shelf, q, filters, sort), [views, shelf, q, filters, sort])
  const counts = useMemo(() => Object.fromEntries(SHELVES.map((s) => [s.id, views.filter((v) => inShelf(v, s.id)).length])), [views])
  // celebrate: compare points before/after each change to the library (skipped on first load)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (loading) return
    const now = computeStats(views, goals)
    if (prevStats.current) {
      const msg = diffMessage(prevStats.current, now)
      if (msg) { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 5500) }
    }
    prevStats.current = now
  }, [views, goals, loading])
  const open = openId ? views.find((v) => v.book.id === openId) : undefined
  const searching = q.trim().length > 0
  
  if (storageError) return (
    <div className="mx-auto mt-16 max-w-md px-4"><div className="card p-6 text-center" role="alert">
      <div className="text-5xl" aria-hidden>🐙</div><h1 className="mt-3 text-xl font-bold">Booktopus can’t open its storage</h1>
      <p className="serif mt-2 text-muted">Your browser is blocking the place books are saved. This usually happens in a private or incognito window, or when site storage is switched off. Open Booktopus in a normal window (on iPhone: Safari, not a private tab) and try again.</p>
      <button className="btn btn-primary mt-4" onClick={() => location.reload()}>Try again</button>
      <details className="mt-4 text-left text-xs text-muted"><summary className="cursor-pointer">Technical details</summary><pre className="mt-1 whitespace-pre-wrap break-words">{storageError}</pre></details>
    </div></div>
  )

  return (
    <>
      <SeaFx />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
        <header className="flex items-center gap-3">
          <button onClick={() => go('home')} className="flex items-center gap-3 text-left" aria-label="Booktopus home">
            <img src="./icon.svg" alt="" className="h-11 w-11 rounded-xl shadow" />
            <span><span className="block font-display text-xl font-bold leading-none tracking-wide sm:text-3xl">Booktopus</span><span className="serif text-sm italic text-muted">{possessive(name)} underwater library</span></span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button data-tour="add" className="btn btn-primary whitespace-nowrap" onClick={() => go('import')}><span aria-hidden>＋</span> Add<span className="hidden sm:inline"> books</span></button>
            <div className="relative">
              <button data-tour="menu" className="btn btn-ghost !px-3" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
              {menu && (
                <div className="card fade-in absolute right-0 z-30 mt-2 w-56 overflow-hidden py-1 text-sm shadow-lg" style={{ background: 'var(--c-sea)' }}>
                  <button className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => go('import', 'manual')}>Add one book by hand</button>
                  <button className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => { setMenu(false); setTour(true) }}>Take the tour</button>
                  {([['stats', 'Reading Reef (stats & badges)'], ['history', 'Import history'], ['settings', 'Settings & backup']] as const).map(([v, l]) => <button key={v} className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => go(v)}>{l}</button>)}
                  <button className="block w-full px-4 py-3 text-left hover:bg-mist" onClick={() => { switchTheme(theme === 'deep' ? 'lagoon' : 'deep'); setMenu(false) }}>{theme === 'deep' ? '🏝️ Sunlit Lagoon colors' : '🌌 Deep Sea colors'}</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {(view === 'home' || view === 'shelf' || view === 'find' || view === 'series' || view === 'stats') && (
          <main className="mt-5">
            {view !== 'stats' && view !== 'series' && <SearchBar q={q} setQ={onSearch} mode={mode} setMode={setMode} />}
            <div data-tour="tabs" className="mx-auto mt-4 grid max-w-md grid-cols-4 gap-2" role="tablist" aria-label="Main">
              {([['home', '🐙 Home'], ['shelf', '📚 Library'], ['series', '🔗 Series'], ['stats', '🏆 Reef']] as const).map(([v, l]) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => go(v)} className={`btn !min-h-16 flex-col !gap-0.5 !rounded-2xl !px-1 !py-2 text-xs leading-tight ${view === v ? 'btn-primary' : 'btn-ghost'}`}><span className="text-lg leading-none" aria-hidden>{l.split(' ')[0]}</span><span>{l.split(' ')[1]}</span></button>
              ))}
            </div>
          </main>
        )}

        {view === 'home' && (
          <main className="mt-5">
            {loading ? <p className="mt-16 text-center text-muted">Diving in…</p>
              : views.length === 0 ? <Welcome name={name} onImport={() => go('import')} onManual={() => go('import', 'manual')} />
              : <Home views={views} name={name} goals={goals} onReef={() => go('stats')} onSeries={() => go('series')} onOpen={setOpenId} onShelf={(s) => { setShelf(s); setQ(''); setFilters(NO_FILTERS); go('shelf') }} onAdd={() => go('import')} onManual={() => go('import', 'manual')} />}
          </main>
        )}

        {view === 'find' && <main className="mt-5"><FindBooks q={q} books={data?.books ?? []} onOpen={(id) => setOpenId(id)} onQuery={setQ} /></main>}

        {view === 'series' && <main className="mt-5"><SeriesView books={data?.books ?? []} onOpen={(id) => setOpenId(id)} /></main>}

        {view === 'stats' && <main className="mt-5"><Reef views={views} goals={goals} onOpen={(id) => setOpenId(id)} /></main>}

        {view === 'shelf' && (
          <main className="mt-2">
            <nav className="scroll-x -mx-4 mt-3 flex gap-2 px-4 sm:mx-0 sm:px-0" aria-label="Shelves">
              {SHELVES.map((s) => (
                <button key={s.id} onClick={() => setShelf(s.id)} aria-current={shelf === s.id} title={s.label}
                  className={`btn shrink-0 !min-h-10 !py-1.5 text-sm ${shelf === s.id ? 'btn-primary' : 'btn-ghost'}`}>{s.short} <span className="opacity-70">{counts[s.id] ?? 0}</span></button>
              ))}
            </nav>
            {!loading && views.length > 0 && <div className="mt-3"><FilterBar views={views} filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} /></div>}

            {loading ? <p className="mt-16 text-center text-muted">Diving in…</p>
              : views.length === 0 ? <Welcome name={name} onImport={() => go('import')} onManual={() => go('import', 'manual')} />
              : shown.length === 0 ? (
                <div className="mt-14 text-center fade-in">
                  <p className="text-muted">{searching ? `Nothing matches “${q}”.` : 'Nothing on this shelf yet.'}</p>
                  {searching && <div className="mt-4 flex flex-wrap justify-center gap-2"><button className="btn btn-primary" onClick={() => { setModeState('web'); saveSettings({ searchMode: 'web' }); go('find') }}>🌐 Search all books for “{q}”</button><button className="btn btn-ghost" onClick={() => go('import', 'manual', q)}>Add “{q}” by hand</button></div>}
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

        {view !== 'shelf' && view !== 'home' && view !== 'stats' && view !== 'find' && view !== 'series' && (
          <main className="mt-6">
            <button className="mb-4 text-sm text-accent underline" onClick={() => go('home')}>← Home</button>
            {view === 'import' && <ImportFlow kind={importKind} setKind={setImportKind} books={data?.books ?? []} onDone={() => go('home')} prefill={prefill} />}
            {view === 'history' && <History batches={data?.batches ?? []} />}
            {view === 'settings' && <SettingsView bookCount={views.length} onChanged={() => go('home')} onTheme={switchTheme} name={name} onName={setName} goals={goals} onGoals={setGoals} onTour={() => setTour(true)} />}
          </main>
        )}

        {tour && !loading && <Tour name={name} setName={setName} onNavigate={goHomeForTour} onFinish={finishTour} />}

        {toast && <div role="status" className="sheet-in card pointer-events-none fixed inset-x-4 bottom-6 z-[60] mx-auto max-w-md p-4 text-center font-semibold shadow-2xl" style={{ background: 'var(--c-sea)', borderColor: 'var(--c-gold)' }}>🎉 {toast}</div>}

        {open && <BookDetail v={open} all={views} events={data?.events.filter((e) => e.bookId === open.book.id) ?? []} onClose={() => setOpenId(null)} />}
      </div>
    </>
  )
}

function Welcome({ name, onImport, onManual }: { name: string; onImport: () => void; onManual: () => void }) {
  return (
    <div className="card fade-in mx-auto mt-10 max-w-xl p-8 text-center">
      <div className="text-5xl" aria-hidden>🐙</div>
      <h2 className="mt-3 text-2xl font-bold">Welcome{name ? `, ${name}` : ''}</h2>
      <p className="serif mt-2 text-lg text-muted">Your octopus has eight arms and an empty shelf. Bring in the books you already have. No typing them all in.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button className="btn btn-primary" onClick={onImport}>Add my books</button>
        <button className="btn btn-ghost" onClick={onManual}>Add one by hand</button>
      </div>
    </div>
  )
}
