import { armMode, assignArms } from './arms'
import type { BookView } from './shelves'
import type { Book } from '../types'

export const TRIVIA: string[] = [
  'Octopuses have three hearts: two pump blood through the gills, and one pumps it around the body.',
  'Octopus blood is blue, because it carries oxygen with copper instead of iron.',
  'An octopus has a central brain plus a mini-brain in each arm, so most of its neurons sit in its arms.',
  'An octopus can squeeze through any opening larger than its hard, parrot-like beak, since the rest of it has no bones.',
  'The word “octopus” comes from Greek and means “eight-footed.” Its plural can be octopuses or octopodes.',
  'Octopuses can change both the color and the texture of their skin to blend in with a rock or a coral.',
  'Octopuses taste with their arms. The suckers are covered in chemical sensors.',
  'Many octopuses live only one to a few years, so they pack a lot into a short life, like a good page-turner.',
  'Reading a few pages before bed is a classic way to wind down. Even ten minutes a day adds up to a book every few weeks.',
  'Audiobooks count! Listening to a story is still reading it, and it can turn a commute into reading time.',
]
export const triviaOfTheDay = (now = new Date()) => TRIVIA[Math.floor(now.getTime() / 86400000) % TRIVIA.length]

export interface Suggestion { kind: 'series' | 'genre' | 'stalled' | 'explore'; book: Book; reason: string }

/** Helpful nudges derived from the library. Pure function so it is easy to test. */
export function suggestions(views: BookView[], now = new Date()): Suggestion[] {
  const out: Suggestion[] = []
  const used = new Set<string>()
  const add = (s: Suggestion) => { if (!used.has(s.book.id)) { used.add(s.book.id); out.push(s) } }
  const onArm = new Set(assignArms(views.map((v) => v.book)).filter(Boolean).map((b) => b!.id))
  const finished = views.filter((v) => v.book.status === 'finished' || v.book.readings.length)
  const unread = views.filter((v) => !finished.includes(v) && v.book.status !== 'dnf' && v.book.status !== 'in_progress' && !(onArm.has(v.book.id) && armMode(v.book) === 'queued'))

  // 1. the next book in a series you've been reading
  for (const f of finished) {
    const { series, seriesNumber } = f.book
    if (!series || seriesNumber == null) continue
    const next = unread.find((u) => u.book.series === series && u.book.seriesNumber === seriesNumber + 1)
    if (next) add({ kind: 'series', book: next.book, reason: `Next in ${series}, after “${f.book.title}”` })
  }
  // 2. stalled: started a while ago and never finished
  for (const v of views) {
    if (v.book.status !== 'in_progress' || !v.book.startedAt) continue
    const days = Math.floor((now.getTime() - new Date(v.book.startedAt).getTime()) / 86400000)
    if (days >= 30) add({ kind: 'stalled', book: v.book, reason: `You started this ${days} days ago. Finish it, or let it go?` })
  }
  // 3. from your own to-read pile, favour genres and authors you've enjoyed
  const genreScore = new Map<string, number>(), authorScore = new Map<string, number>()
  for (const f of finished) {
    const w = 1 + (f.book.favorite ? 1 : 0) + ((f.book.rating ?? 0) >= 4 ? 1 : 0)
    f.book.genres.forEach((g) => genreScore.set(g, (genreScore.get(g) ?? 0) + w))
    f.book.authors.forEach((a) => authorScore.set(a, (authorScore.get(a) ?? 0) + w))
  }
  const scored = unread.map((u) => {
    const g = u.book.genres.map((x) => ({ x, s: genreScore.get(x) ?? 0 })).sort((a, b) => b.s - a.s)[0]
    const a = u.book.authors.map((x) => ({ x, s: authorScore.get(x) ?? 0 })).sort((p, q) => q.s - p.s)[0]
    const s = (g?.s ?? 0) + (a?.s ?? 0) * 2 + (u.book.wantToRead ? 2 : 0)
    return { u, s, g, a }
  }).filter((x) => x.s > 0).sort((p, q) => q.s - p.s)
  for (const { u, g, a } of scored.slice(0, 3)) {
    const nFin = g ? finished.filter((f) => f.book.genres.includes(g.x)).length : 0
    const reason = a && a.s > 0 ? `You’ve enjoyed ${a.x} before` : g && g.s > 0 ? `You’ve finished ${nFin} ${g.x} book${nFin === 1 ? '' : 's'}` : 'From your to-read pile'
    add({ kind: 'genre', book: u.book, reason })
  }
  // 4. stretch: a genre on your shelf that you haven't finished anything in yet
  const finishedGenres = new Set(finished.flatMap((f) => f.book.genres))
  for (const u of unread) {
    const fresh = u.book.genres.find((g) => !finishedGenres.has(g))
    if (fresh && finished.length) { add({ kind: 'explore', book: u.book, reason: `Try something new: you haven’t finished a ${fresh} book yet` }); break }
  }
  return out.slice(0, 6)
}
