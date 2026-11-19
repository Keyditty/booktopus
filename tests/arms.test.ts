import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { db } from '../src/lib/db'
import { assignArms } from '../src/lib/arms'
import { commitImport, planImport, placeOnArm, removeFromArm, setStatus } from '../src/lib/store'
import type { Candidate } from '../src/types'

const cand = (n: number): Candidate => ({ title: `Book Number ${n}`, authors: [`Author${n} Smith`], format: 'ebook', source: 'manual', identifiers: {}, activity: 'unknown', events: [], confidence: 1, provenance: 't' })
async function seed(n: number) {
  await commitImport(planImport(Array.from({ length: n }, (_, i) => cand(i + 1)), []).map((x) => ({ ...x, include: true })), { adapter: 't', label: 't' })
  return (await db.books.toArray()).sort((a, b) => a.title.localeCompare(b.title))
}
beforeEach(async () => { await freshDb() })

describe('octopus arms', () => {
  it('holds eight books, each reading or up next, and refuses a ninth', async () => {
    const books = await seed(9)
    for (let i = 0; i < 8; i++) expect(await placeOnArm(books[i].id, i < 3 ? 'reading' : 'queued')).toBe(true)
    expect(await placeOnArm(books[8].id, 'queued')).toBe(false)
    const layout = assignArms(await db.books.toArray())
    expect(layout.every(Boolean)).toBe(true)
    expect(layout.filter((b) => b!.status === 'in_progress')).toHaveLength(3)
    expect(layout.filter((b) => b!.wantToRead && b!.status !== 'in_progress')).toHaveLength(5)
  })
  it('moving between reading and up next, and finishing, frees or keeps arms correctly', async () => {
    const [a, b] = await seed(2)
    await placeOnArm(a.id, 'queued'); await placeOnArm(b.id, 'reading')
    await placeOnArm(a.id, 'reading')
    expect((await db.books.get(a.id))!.status).toBe('in_progress')
    await placeOnArm(a.id, 'queued')
    expect((await db.books.get(a.id))!.status).toBe('not_started')
    await setStatus(b.id, 'finished')
    expect((await db.books.get(b.id))!.arm).toBeUndefined()
    expect(assignArms(await db.books.toArray()).filter(Boolean)).toHaveLength(1)
    await removeFromArm(a.id)
    expect(assignArms(await db.books.toArray()).filter(Boolean)).toHaveLength(0)
  })
  it('books already marked Reading (no arm yet) still appear on free arms', async () => {
    const [a, b] = await seed(2)
    await db.books.update(a.id, { status: 'in_progress' }); await db.books.update(b.id, { status: 'in_progress' })
    expect(assignArms(await db.books.toArray()).filter(Boolean)).toHaveLength(2)
  })
})
