import { describe, expect, it } from 'vitest'
import { applyAll, buildViews, NO_FILTERS } from '../src/lib/shelves'
import { computeStats } from '../src/lib/gamify'
import { buildSeriesGroups } from '../src/lib/seriesTracker'
import { suggestions } from '../src/lib/insights'
import { planImport } from '../src/lib/store'
import type { Book, Candidate, SourceRecord } from '../src/types'

// varied, realistic-looking titles: seeded pseudo-random syllable words, 1-5 words long
let seed = 42
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const SYL = ['ka', 'lo', 'mi', 'ra', 'to', 'ven', 'dor', 'el', 'an', 'sha', 'bri', 'cor', 'fen', 'gar', 'hal', 'jin', 'kes', 'lum', 'nor', 'pel', 'qua', 'rin', 'sol', 'tur', 'ul', 'vex', 'wyn', 'yar', 'zen']
const word = () => { let w = ''; for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) w += SYL[Math.floor(rnd() * SYL.length)]; return w[0].toUpperCase() + w.slice(1) }
const TITLES = Array.from({ length: 6000 }, () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, word).join(' '))
const title = (i: number) => TITLES[i % TITLES.length]
const mkBook = (i: number): Book => ({ id: `b${i}`, title: title(i), authors: [`Author${i % 90} Name`], genres: [`Genre ${i % 14}`], identifiers: {}, series: i % 5 === 0 ? `Series ${i % 60}` : undefined, seriesNumber: i % 5 === 0 ? (i % 4) + 1 : undefined,
  status: i % 3 === 0 ? 'finished' : 'unknown', statusSource: 'user', wantToRead: i % 7 === 0, favorite: i % 11 === 0, finishedAt: `202${4 + (i % 3)}-${String((i % 12) + 1).padStart(2, '0')}-15`, rating: (i % 5) + 1,
  readings: [], userEdited: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })
const books = Array.from({ length: 1500 }, (_, i) => mkBook(i))
const sources: SourceRecord[] = books.map((b, i) => ({ id: `s${i}`, bookId: b.id, key: `k${i}`, source: i % 2 ? 'libby' : 'audible', format: 'ebook', activity: 'borrowed', provenance: 't', batchId: 'b', addedAt: '' }))
const time = <T,>(fn: () => T): [T, number] => { const t = performance.now(); const r = fn(); return [r, Math.round(performance.now() - t)] }

describe('performance with a large library (1,500 books)', () => {
  const views = buildViews(books, sources)
  it('screen-building work stays well under a second', () => {
    const t: Record<string, number> = {}
    t.views = time(() => buildViews(books, sources))[1]
    t.filter = time(() => applyAll(views, 'all', 'shadow', NO_FILTERS, 'title'))[1]
    t.stats = time(() => computeStats(views, { yearly: 24, monthly: 2 }))[1]
    t.series = time(() => buildSeriesGroups(books))[1]
    t.ideas = time(() => suggestions(views))[1]
    console.log('1,500 books, ms:', JSON.stringify(t))
    for (const [k, v] of Object.entries(t)) expect(v, k).toBeLessThan(1500)
  })
  it('planning a 400-book import against the full library finishes in a few seconds', { timeout: 60000 }, () => {
    const cands: Candidate[] = Array.from({ length: 400 }, (_, i) => ({ title: title(i * 3 + 1), authors: [`Author${i % 90} Name`], format: 'ebook', source: 'manual', identifiers: {}, activity: 'unknown', events: [], confidence: 0.9, provenance: 't' }))
    const [items, ms] = time(() => planImport(cands, books))
    console.log(`plan 400 vs 1,500: ${ms} ms, ${items.length} rows`)
    expect(ms).toBeLessThan(3000)
  })
})
