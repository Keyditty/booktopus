import { useMemo, useState } from 'react'
import { Cover } from './Cover'
import { computeStats, LEVELS, POINTS, type Goals } from '../lib/gamify'
import { addToWantList, buildSeeds, notInLibrary, searchLinks, type Seed } from '../lib/discover'
import { discoverBooks, type Meta } from '../lib/metadata'
import { suggestions, triviaOfTheDay } from '../lib/insights'
import { placeOnArm } from '../lib/store'
import { FORMAT_LABEL, SERVICE_LABEL, type BookView } from '../lib/shelves'
import type { Book, Format, SourceName } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Bar({ label, value, max, extra, sub }: { label: string; value: number; max: number; extra?: number; sub?: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 truncate sm:w-36" title={label}>{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-mist">
        {extra ? <div className="absolute inset-y-0 left-0 rounded bg-line/70" style={{ width: `${(extra / max) * 100}%` }} /> : null}
        <div className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${(value / max) * 100}%`, minWidth: value ? 6 : 0 }} />
      </div>
      <span className="w-16 shrink-0 text-right tabular-nums text-muted">{value}{sub}</span>
    </div>
  )
}

export function Reef({ views, goals, onOpen }: { views: BookView[]; goals: Goals; onOpen: (id: string) => void }) {
  const now = useMemo(() => new Date(), [])
  const s = useMemo(() => computeStats(views, goals, now), [views, goals, now])
  const years = useMemo(() => [...new Set([String(now.getFullYear()), ...s.perYear.keys()])].sort().reverse(), [s, now])
  const [year, setYear] = useState(String(now.getFullYear()))
  const [showPoints, setShowPoints] = useState(false)
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [allGenres, setAllGenres] = useState(false)
  const sugg = useMemo(() => suggestions(views, now), [views, now])
  const monthVals = MONTHS.map((_, i) => s.perMonth.get(`${year}-${String(i + 1).padStart(2, '0')}`) ?? 0)
  const monthMax = Math.max(1, goals.monthly, ...monthVals)
  const yearRows = [...s.perYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  const genreMax = Math.max(1, ...s.genres.map((g) => g.library))
  const lv = s.level
  const pct = Math.min(100, Math.round((s.goals.yearDone / goals.yearly) * 100))
  const pace = s.goals.yearDone >= goals.yearly ? 'Goal reached! 🏆' : s.goals.onPace ? 'On pace ✓' : `${s.goals.expected - s.goals.yearDone} behind pace`

  return (
    <div className="mx-auto max-w-2xl space-y-5 fade-in">
      <h2 className="text-2xl font-bold">Your Reading Reef</h2>

      <section className="card p-5" aria-label="Level and points">
        <div className="flex items-center gap-4">
          <div className="text-5xl" aria-hidden>{lv.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Level {lv.index + 1} of {LEVELS.length}</div>
            <div className="font-display text-2xl font-bold leading-tight">Level {lv.index + 1} · {lv.name}</div>
            <div className="serif text-lg text-gold">{s.points.toLocaleString()} points</div>
          </div>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={Math.round(lv.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${lv.progress * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{lv.next ? `${lv.toNext} points to ${lv.next.emoji} ${lv.next.name}` : 'You’ve reached the deepest level!'}</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <button className="text-sm text-accent underline" onClick={() => setLevelsOpen(true)}>See all {LEVELS.length} levels</button>
          <button className="text-sm text-accent underline" onClick={() => setShowPoints(!showPoints)} aria-expanded={showPoints}>How do I earn points?</button>
        </div>
        {showPoints && (
          <ul className="fade-in mt-2 space-y-1 text-sm">
            <li>📖 <strong>{POINTS.finish}</strong> for every book you finish ({s.breakdown.reading})</li>
            <li>🔁 <strong>{POINTS.reread}</strong> for a re-read ({s.breakdown.rereads})</li>
            <li>⭐ <strong>{POINTS.rated}</strong> for rating a finished book ({s.breakdown.ratings})</li>
            <li>✏️ <strong>{POINTS.notes}</strong> for writing notes on it ({s.breakdown.notes})</li>
            <li>🧭 <strong>{POINTS.newGenre}</strong> the first time you finish a book in a new genre ({s.breakdown.explorer})</li>
            <li>🏆 <strong>{POINTS.monthGoal}</strong> for each month you hit your monthly goal, <strong>{POINTS.yearGoal}</strong> for a yearly goal ({s.breakdown.goals})</li>
            <li className="text-xs text-muted">Points are worked out from your shelf, so they always match what you’ve really finished.</li>
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        {([[s.finishedBooks, 'books finished'], [s.thisYear, `in ${now.getFullYear()}`], [s.thisMonth, 'this month'], [s.libraryBooks, 'in your library']] as const).map(([n, l]) => (
          <div key={l} className="card p-3"><div className="serif text-3xl font-bold text-accent">{n}</div><div className="text-xs text-muted">{l}</div></div>
        ))}
      </div>

      <section className="card p-5" aria-label="Goals and streak">
        <div className="flex items-baseline justify-between"><h3 className="font-bold">{now.getFullYear()} goal: {goals.yearly} books</h3><span className="text-sm text-muted">{s.goals.yearDone} done · {pace}</span></div>
        <div className="mt-2 h-4 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Yearly goal progress"><div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} /></div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>📅 This month: <strong>{s.goals.monthDone} / {goals.monthly}</strong></div>
          <div>🔥 Streak: <strong>{s.streak.current}</strong> month{s.streak.current === 1 ? '' : 's'} <span className="text-muted">(best {s.streak.longest})</span></div>
        </div>
        <p className="mt-2 text-xs text-muted">Change your goals in Settings.</p>
      </section>

      <section className="card p-5" aria-label="Books per month">
        <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Books each month</h3>
          <select className="field !min-h-9 !w-auto !py-1 text-sm" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select></div>
        <div className="mt-4 flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label={`Books finished per month in ${year}: ${MONTHS.map((m, i) => `${m} ${monthVals[i]}`).join(', ')}`}>
          {monthVals.map((n, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] tabular-nums text-muted">{n || ''}</span>
              <div className={`w-full rounded-t ${n >= goals.monthly ? 'bg-gold' : 'bg-accent'}`} style={{ height: `${(n / monthMax) * 100}%`, minHeight: n ? 4 : 2, opacity: n ? 1 : 0.25 }} />
              <span className="text-[10px] text-muted">{MONTHS[i][0]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gold" /> months where you hit your goal of {goals.monthly}</p>
        {s.undated > 0 && <p className="mt-1 text-xs text-muted">{s.undated} finished book{s.undated === 1 ? ' has' : 's have'} no finish date, so {s.undated === 1 ? 'it isn’t' : 'they aren’t'} in these charts. Add dates on the book’s page.</p>}
      </section>

      <section className="card p-5" aria-label="Books per year">
        <h3 className="font-bold">Books each year</h3>
        {yearRows.length ? yearRows.map(([y, n]) => <Bar key={y} label={y} value={n} max={Math.max(goals.yearly, ...yearRows.map((r) => r[1]))} />) : <p className="mt-1 text-sm text-muted">Mark a book as finished (with a date) to see this fill in.</p>}
        <p className="mt-3 text-sm text-muted">All time: <strong className="text-ink">{s.finishedBooks}</strong> books finished{s.finishes > s.finishedBooks ? ` (${s.finishes} counting re-reads)` : ''} out of {s.libraryBooks} in your library.</p>
      </section>

      <section className="card p-5" aria-label="Genres">
        <h3 className="font-bold">By genre</h3>
        <p className="text-xs text-muted">Bright bar = finished, faint bar = on your shelf.</p>
        {s.genres.length ? s.genres.slice(0, allGenres ? 100 : 10).map((g) => <Bar key={g.name} label={g.name} value={g.finished} extra={g.library} max={genreMax} sub={`/${g.library}`} />) : <p className="mt-1 text-sm text-muted">Genres appear once books have been matched online or edited.</p>}
        {s.genres.length > 10 && <button className="mt-3 text-sm text-accent underline" onClick={() => setAllGenres(!allGenres)}>{allGenres ? 'Show fewer' : `Show all ${s.genres.length} genres`}</button>}
        <p className="mt-2 text-xs text-muted">Missing a genre? Open any book and tap “＋ Genre” to add your own, like Romantasy.</p>
        {s.formats.length > 0 && <p className="mt-4 text-sm text-muted">Finished by format: {s.formats.map(([f, n]) => `${FORMAT_LABEL[f as Format]} ${n}`).join(' · ')}</p>}
        {s.services.length > 0 && <p className="mt-1 text-sm text-muted">Finished by service: {s.services.map(([f, n]) => `${SERVICE_LABEL[f as SourceName]} ${n}`).join(' · ')}</p>}
        {s.authors.length > 0 && <p className="mt-1 text-sm text-muted">Favorite authors: {s.authors.map(([a, n]) => `${a} (${n})`).join(' · ')}</p>}
      </section>

      <section className="card p-5" aria-label="Badges">
        <div className="flex items-baseline justify-between"><h3 className="font-bold">Badges</h3><span className="text-sm text-muted">{s.earnedBadges} of {s.badges.length}</span></div>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {s.badges.map((b) => (
            <li key={b.id} className={`rounded-xl border p-3 text-center ${b.earned ? 'border-gold bg-mist' : 'border-line opacity-60'}`}>
              <div className={`text-3xl ${b.earned ? '' : 'grayscale'}`} aria-hidden>{b.emoji}</div>
              <div className="text-sm font-semibold">{b.name}</div>
              <div className="text-[11px] text-muted">{b.earned ? 'Earned!' : b.desc}</div>
              {!b.earned && <div className="mt-0.5 text-[11px] tabular-nums text-accent">{b.progress}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5" aria-label="Suggestions">
        <h3 className="font-bold">Ideas for you</h3>
        {sugg.length ? (
          <ul className="mt-3 space-y-3">
            {sugg.map((g) => (
              <li key={g.book.id} className="flex items-center gap-3">
                <button className="w-12 shrink-0" onClick={() => onOpen(g.book.id)} aria-label={`Open ${g.book.title}`}><Cover title={g.book.title} author={g.book.authors[0]} url={g.book.coverUrl} /></button>
                <div className="min-w-0 flex-1"><div className="serif truncate font-semibold">{g.book.title}</div><div className="text-xs text-muted">{g.reason}</div></div>
                {g.kind !== 'stalled' && <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" onClick={() => placeOnArm(g.book.id, 'queued')}>🐙 Up next</button>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-muted">Finish and rate a few books and I’ll start suggesting what to read next.</p>}
      </section>

      <Discover views={views} />

      <section className="card p-5 text-center" aria-label="Trivia">
        <h3 className="font-bold">🐙 Did you know?</h3>
        <p className="serif mt-1 text-lg">{triviaOfTheDay(now)}</p>
      </section>

      {levelsOpen && <LevelsSheet points={s.points} onClose={() => setLevelsOpen(false)} />}
    </div>
  )
}

function LevelsSheet({ points, onClose }: { points: number; onClose: () => void }) {
  const cur = LEVELS.reduce((a, l, i) => (points >= l.at ? i : a), 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 fade-in sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="All levels">
      <div className="sheet-in card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl" style={{ background: 'var(--c-sea)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-xl font-bold">The ocean ladder</h3><button className="text-sm text-accent underline" onClick={onClose}>Close</button></div>
        <p className="mt-1 text-sm text-muted">Earn points by finishing books. Each level is a deeper sea creature. You have <strong className="text-gold">{points.toLocaleString()}</strong> points.</p>
        <ol className="mt-4 space-y-2">
          {LEVELS.map((l, i) => {
            const state = i < cur ? 'done' : i === cur ? 'now' : 'locked'
            return (
              <li key={l.name} className={`flex items-center gap-3 rounded-xl border p-3 ${state === 'now' ? 'border-gold bg-mist' : 'border-line'} ${state === 'locked' ? 'opacity-60' : ''}`} aria-current={state === 'now' ? 'step' : undefined}>
                <span className={`text-3xl ${state === 'locked' ? 'grayscale' : ''}`} aria-hidden>{l.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block font-display font-bold">Level {i + 1} · {l.name}</span><span className="block text-xs text-muted">{l.at === 0 ? 'Where everyone starts' : `${l.at.toLocaleString()} points`}</span></span>
                <span className="text-xs font-semibold">{state === 'done' ? '✓ Reached' : state === 'now' ? 'You are here' : `${(l.at - points).toLocaleString()} to go`}</span>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 text-xs text-muted">A finished book is worth 100 points. Ratings, notes, new genres, goals and re-reads earn extra.</p>
      </div>
    </div>
  )
}

/* ---------- Find more: ideas based on what is already on the shelf, ending in a web search or one-tap add ---------- */

function Discover({ views }: { views: BookView[] }) {
  const books = useMemo(() => views.map((v) => v.book), [views])
  const seeds = useMemo(() => buildSeeds(books), [books])
  if (!seeds.length) return null
  return (
    <section className="card p-5" aria-label="Find more books">
      <h3 className="font-bold">Find more to read</h3>
      <p className="text-xs text-muted">Based on what you’ve loved. Links open a web search in a new tab. “Show ideas” looks up books here using Google Books / Open Library, and only sends the author or genre name.</p>
      <div className="mt-3 space-y-4">{seeds.map((sd) => <SeedCard key={sd.id} seed={sd} books={books} />)}</div>
    </section>
  )
}

function SeedCard({ seed, books }: { seed: Seed; books: Book[] }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [res, setRes] = useState<Meta[]>([])
  const [added, setAdded] = useState<Set<string>>(new Set())
  const canSearch = seed.kind !== 'book'
  async function load() {
    setState('loading')
    const r = await discoverBooks(seed.kind as 'author' | 'genre', seed.value)
    setRes(notInLibrary(r, books).slice(0, 8)); setState('done')
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="serif font-semibold">{seed.title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {searchLinks(seed.query).map((l) => <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs">🔎 {l.label}</a>)}
        {canSearch && state === 'idle' && <button className="btn btn-primary !min-h-9 !px-3 !py-1 text-xs" onClick={load}>Show ideas here</button>}
      </div>
      {state === 'loading' && <p className="mt-2 text-xs text-muted">Looking…</p>}
      {state === 'done' && !res.length && <p className="mt-2 text-xs text-muted">Couldn’t find ideas right now (you may be offline). The search links above still work.</p>}
      {res.length > 0 && (
        <ul className="mt-3 space-y-2">
          {res.map((m, i) => {
            const k = m.title + i
            return (
              <li key={k} className="flex items-center gap-3">
                <span className="w-10 shrink-0"><Cover title={m.title} author={m.authors[0]} url={m.coverUrl} /></span>
                <span className="min-w-0 flex-1"><span className="serif block truncate text-sm font-semibold">{m.title}</span><span className="block truncate text-xs text-muted">{m.authors.join(', ')}{m.year ? ` · ${m.year}` : ''}</span></span>
                <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" disabled={added.has(k)} onClick={async () => { await addToWantList(m); setAdded(new Set(added).add(k)) }}>{added.has(k) ? '✓ Added' : '＋ Want to read'}</button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
