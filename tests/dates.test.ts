import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { db } from '../src/lib/db'
import { localToday } from '../src/lib/normalize'
import { commitImport, planImport, setStatus } from '../src/lib/store'
import { computeStats } from '../src/lib/gamify'
import { buildViews } from '../src/lib/shelves'
import type { Candidate } from '../src/types'

beforeEach(async () => { await freshDb() })

describe('finish dates', () => {
  it('localToday uses the local calendar day, not UTC', () => {
    expect(localToday(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31') // 11:30pm Dec 31 local, whatever the time zone
    expect(localToday(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })
  it('marking a book Finished stamps today so it counts this year and this month', async () => {
    const c: Candidate = { title: 'X Book', authors: ['A B'], format: 'ebook', source: 'manual', identifiers: {}, activity: 'unknown', events: [], confidence: 1, provenance: 't' }
    await commitImport(planImport([c], []).map((i) => ({ ...i, include: true })), { adapter: 't', label: 't' })
    const id = (await db.books.toArray())[0].id
    await setStatus(id, 'finished')
    const b = (await db.books.get(id))!
    expect(b.finishedAt).toBe(localToday())
    const s = computeStats(buildViews([b], []), { yearly: 12, monthly: 2 })
    expect(s.finishedBooks).toBe(1); expect(s.thisYear).toBe(1); expect(s.thisMonth).toBe(1)
  })
  it('an undated finished book counts as finished but is flagged, not silently lost', () => {
    const b = { id: '1', title: 'T', authors: [], genres: [], identifiers: {}, status: 'finished' as const, statusSource: 'user' as const, wantToRead: false, favorite: false, readings: [], userEdited: [], createdAt: '', updatedAt: '' }
    const s = computeStats(buildViews([b], []), { yearly: 12, monthly: 2 })
    expect(s.finishedBooks).toBe(1); expect(s.thisYear).toBe(0); expect(s.undated).toBe(1)
  })
})
