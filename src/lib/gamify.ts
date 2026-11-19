import { ARM_COUNT, assignArms } from './arms'
import type { BookView } from './shelves'

/* Points are DERIVED from the library every time, never stored. That keeps them honest:
   un-marking a book or undoing an import takes its points away, and nothing can be counted twice. */

export const POINTS = { finish: 100, reread: 50, rated: 20, notes: 20, newGenre: 50, monthGoal: 100, yearGoal: 300 } as const

/** Levels are earned by BOOKS FINISHED. Each step roughly doubles or more, so the top level (1,000 books) is a true long-term goal. */
export const LEVELS: { at: number; name: string; emoji: string }[] = [
  { at: 0, name: 'Plankton', emoji: '🦠' }, { at: 10, name: 'Shrimp', emoji: '🦐' }, { at: 25, name: 'Clownfish', emoji: '🐠' },
  { at: 50, name: 'Sea Turtle', emoji: '🐢' }, { at: 100, name: 'Dolphin', emoji: '🐬' }, { at: 250, name: 'Shark', emoji: '🦈' },
  { at: 500, name: 'Octopus', emoji: '🐙' }, { at: 1000, name: 'Kraken', emoji: '🦑' },
]

export interface Goals { yearly: number; monthly: number }
export interface Finish { bookId: string; date?: string; first: boolean }
export interface Badge { id: string; emoji: string; name: string; desc: string; earned: boolean; progress?: string }

const ym = (d: string) => d.slice(0, 7)

/** Every completed read-through: previous read-throughs plus the current one if finished. */
export function finishesOf(views: BookView[]): Finish[] {
  const out: Finish[] = []
  for (const { book: b } of views) {
    const dates: (string | undefined)[] = b.readings.map((r) => r.finishedAt)
    if (b.status === 'finished') dates.push(b.finishedAt)
    dates.forEach((date, i) => out.push({ bookId: b.id, date, first: i === 0 }))
  }
  return out
}

export function levelFor(booksFinished: number) {
  const points = booksFinished
  let i = 0
  LEVELS.forEach((l, k) => { if (points >= l.at) i = k })
  const cur = LEVELS[i], next = LEVELS[i + 1]
  return { index: i, ...cur, next, progress: next ? (points - cur.at) / (next.at - cur.at) : 1, toNext: next ? next.at - points : 0 }
}

export function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function streaks(months: Set<string>, now: Date) {
  const sorted = [...months].sort()
  let longest = 0, run = 0, prev = ''
  const nextOf = (k: string) => { const [y, m] = k.split('-').map(Number); return monthKey(new Date(y, m, 1)) }
  for (const k of sorted) { run = prev && nextOf(prev) === k ? run + 1 : 1; longest = Math.max(longest, run); prev = k }
  // current streak counts back from this month (or last month, if this month hasn't had a finish yet)
  let cur = 0
  let k = monthKey(now)
  if (!months.has(k)) k = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  while (months.has(k)) { cur++; const [y, m] = k.split('-').map(Number); k = monthKey(new Date(y, m - 2, 1)) }
  return { current: cur, longest }
}

export function computeStats(views: BookView[], goals: Goals, now = new Date()) {
  const finishes = finishesOf(views)
  const byId = new Map(views.map((v) => [v.book.id, v]))
  const finishedViews = views.filter((v) => finishes.some((f) => f.bookId === v.book.id))

  const perMonth = new Map<string, number>(), perYear = new Map<string, number>()
  for (const f of finishes) if (f.date) { perMonth.set(ym(f.date), (perMonth.get(ym(f.date)) ?? 0) + 1); perYear.set(f.date.slice(0, 4), (perYear.get(f.date.slice(0, 4)) ?? 0) + 1) }
  const undated = finishes.filter((f) => !f.date).length

  // points
  const breakdown = { reading: 0, rereads: 0, ratings: 0, notes: 0, explorer: 0, goals: 0 }
  for (const f of finishes) f.first ? (breakdown.reading += POINTS.finish) : (breakdown.rereads += POINTS.reread)
  for (const v of finishedViews) { if (v.book.rating) breakdown.ratings += POINTS.rated; if (v.book.notes?.trim()) breakdown.notes += POINTS.notes }
  const seen = new Set<string>()
  const chrono = [...finishedViews].sort((a, b) => (a.book.finishedAt ?? '9999').localeCompare(b.book.finishedAt ?? '9999'))
  for (const v of chrono) { const fresh = v.book.genres.filter((g) => !seen.has(g)); if (fresh.length) breakdown.explorer += POINTS.newGenre; v.book.genres.forEach((g) => seen.add(g)) }
  const monthsHit = [...perMonth.values()].filter((n) => n >= goals.monthly).length
  const yearsHit = [...perYear.values()].filter((n) => n >= goals.yearly).length
  breakdown.goals = monthsHit * POINTS.monthGoal + yearsHit * POINTS.yearGoal
  const points = Object.values(breakdown).reduce((a, b) => a + b, 0)

  // genres: finished vs in library
  const genreMap = new Map<string, { finished: number; library: number }>()
  for (const v of views) for (const g of v.book.genres) {
    const e = genreMap.get(g) ?? { finished: 0, library: 0 }
    e.library++; if (finishedViews.includes(v)) e.finished++
    genreMap.set(g, e)
  }
  const genres = [...genreMap.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.finished - a.finished || b.library - a.library || a.name.localeCompare(b.name))

  const countBy = (pick: (v: BookView) => string[]) => { const m = new Map<string, number>(); for (const v of finishedViews) for (const k of pick(v)) m.set(k, (m.get(k) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]) }
  const authors = countBy((v) => v.book.authors).slice(0, 5)
  const formats = countBy((v) => v.formats)
  const services = countBy((v) => v.services)

  const thisYear = String(now.getFullYear()), thisMonth = monthKey(now)
  const st = streaks(new Set(perMonth.keys()), now)
  const yearDone = perYear.get(thisYear) ?? 0
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const paceExpected = (goals.yearly * dayOfYear) / 365

  // badges
  const totalBooks = finishedViews.length
  const rated = finishedViews.filter((v) => v.book.rating).length
  const noted = finishedViews.filter((v) => v.book.notes?.trim()).length
  const seriesCounts = new Map<string, number>()
  for (const v of finishedViews) if (v.book.series) seriesCounts.set(v.book.series, (seriesCounts.get(v.book.series) ?? 0) + 1)
  const bestSeries = Math.max(0, ...seriesCounts.values())
  const bestMonth = Math.max(0, ...perMonth.values())
  const finishedGenres = new Set(finishedViews.flatMap((v) => v.book.genres))
  const fmts = new Set(finishedViews.flatMap((v) => v.formats))
  const armsFull = assignArms(views.map((v) => v.book)).filter(Boolean).length === ARM_COUNT
  const prog = (n: number, goal: number) => `${Math.min(n, goal)} / ${goal}`
  const badges: Badge[] = [
    { id: 'first', emoji: '🐚', name: 'First Catch', desc: 'Finish your first book', earned: totalBooks >= 1, progress: prog(totalBooks, 1) },
    { id: 'b5', emoji: '🦐', name: 'Tide Pooler', desc: 'Finish 5 books', earned: totalBooks >= 5, progress: prog(totalBooks, 5) },
    { id: 'b10', emoji: '🐠', name: 'Deep Diver', desc: 'Finish 10 books', earned: totalBooks >= 10, progress: prog(totalBooks, 10) },
    { id: 'b25', emoji: '🐢', name: 'Reef Reader', desc: 'Finish 25 books', earned: totalBooks >= 25, progress: prog(totalBooks, 25) },
    { id: 'b50', emoji: '🐬', name: 'Ocean Scholar', desc: 'Finish 50 books', earned: totalBooks >= 50, progress: prog(totalBooks, 50) },
    { id: 'b100', emoji: '🦑', name: 'Kraken Librarian', desc: 'Finish 100 books', earned: totalBooks >= 100, progress: prog(totalBooks, 100) },
    { id: 'genres', emoji: '🧭', name: 'Genre Explorer', desc: 'Finish books in 5 different genres', earned: finishedGenres.size >= 5, progress: prog(finishedGenres.size, 5) },
    { id: 'formats', emoji: '🎧', name: 'Eyes & Ears', desc: 'Finish both an audiobook and an ebook', earned: fmts.has('audiobook') && fmts.has('ebook'), progress: prog(+fmts.has('audiobook') + +fmts.has('ebook'), 2) },
    { id: 'critic', emoji: '⭐', name: 'Critic', desc: 'Rate 10 finished books', earned: rated >= 10, progress: prog(rated, 10) },
    { id: 'notes', emoji: '✏️', name: 'Margin Notes', desc: 'Write notes on 5 finished books', earned: noted >= 5, progress: prog(noted, 5) },
    { id: 'marathon', emoji: '🏁', name: 'Marathon Month', desc: 'Finish 4 books in one month', earned: bestMonth >= 4, progress: prog(bestMonth, 4) },
    { id: 'streak3', emoji: '🔥', name: 'Three-Month Streak', desc: 'Finish a book 3 months in a row', earned: st.longest >= 3, progress: prog(st.longest, 3) },
    { id: 'streak6', emoji: '🌋', name: 'Half-Year Streak', desc: 'Finish a book 6 months in a row', earned: st.longest >= 6, progress: prog(st.longest, 6) },
    { id: 'series', emoji: '⚓', name: 'Series Sailor', desc: 'Finish 3 books in one series', earned: bestSeries >= 3, progress: prog(bestSeries, 3) },
    { id: 'reread', emoji: '🔁', name: 'Old Favorite', desc: 'Read a book a second time', earned: finishes.some((f) => !f.first), progress: prog(+finishes.some((f) => !f.first), 1) },
    { id: 'arms', emoji: '🐙', name: 'Eight Arms Full', desc: 'Put a book on every octopus arm', earned: armsFull, progress: prog(assignArms(views.map((v) => v.book)).filter(Boolean).length, 8) },
    { id: 'goal', emoji: '🏆', name: 'Goal Getter', desc: 'Reach your yearly reading goal', earned: yearsHit >= 1, progress: prog(yearDone, goals.yearly) },
  ]

  return {
    points, breakdown, level: levelFor(totalBooks), finishes: finishes.length, finishedBooks: totalBooks, undated, libraryBooks: views.length,
    perMonth, perYear, thisYear: yearDone, thisMonth: perMonth.get(thisMonth) ?? 0, streak: st,
    goals: { ...goals, yearDone, monthDone: perMonth.get(thisMonth) ?? 0, onPace: yearDone >= paceExpected, expected: Math.round(paceExpected) },
    genres, authors, formats, services, badges, earnedBadges: badges.filter((b) => b.earned).length, byId,
  }
}

/** Fun summary of what changed, for the little pop-up after finishing a book. */
export function diffMessage(before: ReturnType<typeof computeStats>, after: ReturnType<typeof computeStats>): string | null {
  const gained = after.points - before.points
  if (gained <= 0) return null
  const parts = [`+${gained.toLocaleString()} points`]
  if (after.level.index > before.level.index) parts.push(`Level up: ${after.level.emoji} ${after.level.name}!`)
  const newBadges = after.badges.filter((b) => b.earned && !before.badges.find((x) => x.id === b.id)?.earned)
  if (newBadges.length) parts.push(`New badge: ${newBadges.map((b) => `${b.emoji} ${b.name}`).join(', ')}`)
  return parts.join(' · ')
}
