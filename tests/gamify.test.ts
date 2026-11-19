import { describe, expect, it } from 'vitest'
import { computeStats, diffMessage, levelFor, POINTS } from '../src/lib/gamify'
import { suggestions } from '../src/lib/insights'
import { buildViews } from '../src/lib/shelves'
import type { Book } from '../src/types'

let n = 0
const book = (o: Partial<Book> = {}): Book => ({
  id: `b${++n}`, title: `Book ${n}`, authors: [`Author ${n}`], genres: [], identifiers: {}, status: 'unknown', statusSource: 'user', wantToRead: false, favorite: false,
  readings: [], userEdited: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...o,
})
const views = (bs: Book[]) => buildViews(bs, [])
const NOW = new Date(2026, 5, 15) // 15 June 2026
const GOALS = { yearly: 12, monthly: 2 }

describe('points', () => {
  it('awards 100 per finished book plus small bonuses, and nothing for unfinished ones', () => {
    const s = computeStats(views([
      book({ status: 'finished', finishedAt: '2026-06-01', rating: 5, notes: 'loved it', genres: ['Fantasy'] }),
      book({ status: 'in_progress' }), book({ wantToRead: true }), book({ status: 'dnf' }),
    ]), GOALS, NOW)
    expect(s.finishedBooks).toBe(1)
    expect(s.points).toBe(POINTS.finish + POINTS.rated + POINTS.notes + POINTS.newGenre)
  })
  it('rereads earn less, and un-finishing a book removes its points', () => {
    const b = book({ status: 'finished', finishedAt: '2026-05-01', readings: [{ finishedAt: '2025-05-01' }] })
    const two = computeStats(views([b]), GOALS, NOW)
    expect(two.finishes).toBe(2); expect(two.points).toBe(POINTS.finish + POINTS.reread)
    const none = computeStats(views([{ ...b, status: 'unknown', readings: [] }]), GOALS, NOW)
    expect(none.points).toBe(0)
  })
  it('awards goal bonuses when a monthly goal is met', () => {
    const s = computeStats(views([book({ status: 'finished', finishedAt: '2026-06-02' }), book({ status: 'finished', finishedAt: '2026-06-09' })]), GOALS, NOW)
    expect(s.breakdown.goals).toBe(POINTS.monthGoal)
  })
})

describe('counts and streaks', () => {
  const bs = [
    book({ status: 'finished', finishedAt: '2026-04-10', genres: ['Fantasy'] }), book({ status: 'finished', finishedAt: '2026-05-10', genres: ['Fantasy', 'Fiction'] }),
    book({ status: 'finished', finishedAt: '2026-06-01', genres: ['Mystery'] }), book({ status: 'finished', finishedAt: '2025-12-25', genres: ['Fantasy'] }), book({ status: 'finished' }),
  ]
  const s = computeStats(views(bs), GOALS, NOW)
  it('counts per month, per year, and undated', () => {
    expect(s.perMonth.get('2026-05')).toBe(1); expect(s.perYear.get('2026')).toBe(3); expect(s.perYear.get('2025')).toBe(1)
    expect(s.thisYear).toBe(3); expect(s.thisMonth).toBe(1); expect(s.undated).toBe(1); expect(s.finishedBooks).toBe(5)
  })
  it('counts per genre and streaks', () => {
    expect(s.genres[0]).toMatchObject({ name: 'Fantasy', finished: 3 })
    expect(s.streak).toEqual({ current: 3, longest: 3 })
    expect(s.badges.find((b) => b.id === 'streak3')!.earned).toBe(true)
  })
})

describe('levels, badges, messages', () => {
  it('maps points to levels', () => { expect(levelFor(0).name).toBe('Plankton'); expect(levelFor(150).name).toBe('Shrimp'); expect(levelFor(99999).next).toBeUndefined() })
  it('announces points, level-ups and badges once', () => {
    const before = computeStats(views([]), GOALS, NOW)
    const after = computeStats(views([book({ status: 'finished', finishedAt: '2026-06-01', rating: 5, notes: 'great', genres: ['Fantasy'] })]), GOALS, NOW)
    const msg = diffMessage(before, after)!
    expect(msg).toContain('+190 points'); expect(msg).toContain('Shrimp'); expect(msg).toContain('First Catch')
    expect(diffMessage(after, after)).toBeNull()
  })
})

describe('suggestions', () => {
  it('suggests the next book in a series and flags stalled reads', () => {
    const bs = [
      book({ title: 'Dune', series: 'Dune', seriesNumber: 1, status: 'finished', genres: ['Sci-Fi'] }),
      book({ title: 'Dune Messiah', series: 'Dune', seriesNumber: 2, wantToRead: true, genres: ['Sci-Fi'] }),
      book({ title: 'Old Slog', status: 'in_progress', startedAt: '2026-03-01' }),
    ]
    const s = suggestions(views(bs), NOW)
    expect(s.find((x) => x.kind === 'series')!.book.title).toBe('Dune Messiah')
    expect(s.find((x) => x.kind === 'stalled')!.book.title).toBe('Old Slog')
  })
})
