import { describe, expect, it } from 'vitest'
import { parseBookText } from '../src/lib/importers/text'
import { parseLibby } from '../src/lib/importers/libby'
import { parseListing } from '../src/lib/importers/listing'
import { ocrLinesToCandidates } from '../src/lib/importers/screenshot'
import { splitAuthors, normTitle, splitTitle } from '../src/lib/normalize'

const CHAT = `You said:
Can you list the books I've read?

ChatGPT said:
Sure! Here is your reading list so far:

## Finished
1. **Project Hail Mary** by Andy Weir ⭐⭐⭐⭐⭐
2. "The Midnight Library" by Matt Haig (finished)
- Educated — Tara Westover

### Currently Listening
* Circe by Madeline Miller

**Want to Read**
- Dune: Book One by Frank Herbert
- The Hobbit

Let me know if you want me to add more books! I think the list is about 6 titles long, and it covers many genres.

| Title | Author | Status |
|---|---|---|
| Gone Girl | Gillian Flynn | Read |
| Becoming | Michelle Obama | DNF |
`

describe('ChatGPT / pasted text importer', () => {
  const r = parseBookText(CHAT)
  const by = (t: string) => r.candidates.find((c) => c.title.toLowerCase().startsWith(t.toLowerCase()))!
  it('finds books and ignores chatter', () => {
    const titles = r.candidates.map((c) => c.title)
    expect(titles).toContain('Project Hail Mary')
    expect(titles).toContain('Gone Girl')
    expect(titles.join('|')).not.toMatch(/Let me know|Sure|Can you list/)
    expect(r.candidates).toHaveLength(8)
  })
  it('reads status from headings, annotations and tables', () => {
    expect(by('Project Hail Mary').status).toBe('finished')
    expect(by('Project Hail Mary').rating).toBe(5)
    expect(by('The Midnight').status).toBe('finished')
    expect(by('Circe').status).toBe('in_progress')
    expect(by('Dune').wantToRead).toBe(true)
    expect(by('The Hobbit').wantToRead).toBe(true)
    expect(by('The Hobbit').confidence).toBeLessThan(0.7) // title only => review
    expect(by('Gone Girl').status).toBe('finished')
    expect(by('Becoming').status).toBe('dnf')
  })
  it('splits authors and subtitles', () => {
    expect(by('Educated').authors).toEqual(['Tara Westover'])
    expect(by('Dune').subtitle).toBe('Book One')
  })
  it('parses CSV (Goodreads-style) and JSON', () => {
    const csv = `Title,Author,Exclusive Shelf,My Rating,ISBN13\n"Circe","Miller, Madeline",read,4,"=""9780316556347"""\nDune,Frank Herbert,to-read,0,`
    const c = parseBookText(csv)
    expect(c.format).toBe('csv')
    expect(c.candidates[0]).toMatchObject({ title: 'Circe', authors: ['Madeline Miller'], status: 'finished', rating: 4 })
    expect(c.candidates[0].identifiers.isbn).toBe('9780316556347')
    expect(c.candidates[1].wantToRead).toBe(true)
    const j = parseBookText(JSON.stringify({ books: [{ title: 'Emma', author: 'Jane Austen', status: 'Finished' }] }))
    expect(j.candidates[0]).toMatchObject({ title: 'Emma', status: 'finished' })
  })
  it('handles 100 books', () => {
    const big = Array.from({ length: 100 }, (_, i) => `${i + 1}. Book Number ${i + 1} by Author${i} Smith`).join('\n')
    expect(parseBookText(big).candidates).toHaveLength(100)
  })
})

describe('normalization', () => {
  it('splits authors', () => {
    expect(splitAuthors('Weir, Andy')).toEqual(['Andy Weir'])
    expect(splitAuthors('Neil Gaiman, Terry Pratchett')).toEqual(['Neil Gaiman', 'Terry Pratchett'])
    expect(splitAuthors('Neil Gaiman & Terry Pratchett')).toHaveLength(2)
  })
  it('normalizes titles and extracts series', () => {
    expect(normTitle('The Hobbit: Or There and Back Again')).toBe('hobbit')
    expect(normTitle('Project Hail Mary (Unabridged)')).toBe('project hail mary')
    expect(splitTitle('Dune (Dune Chronicles, Book 1)')).toMatchObject({ title: 'Dune', series: 'Dune Chronicles', seriesNumber: 1 })
  })
})

const LIBBY = `title,author,publisher,isbn,timestamp,activity,library,format
Project Hail Mary,Andy Weir,Audio Up,9781705028001,2025-02-01 10:00:00,Borrowed,City Library,Audiobook
Project Hail Mary,Andy Weir,Audio Up,9781705028001,2025-02-20 09:00:00,Returned,City Library,Audiobook
Circe,"Miller, Madeline",Hachette,9780316556347,2025-03-02,Borrowed,City Library,eBook
Wired Magazine,Wired,Conde,,2025-03-03,Borrowed,City Library,Magazine
Dune,Frank Herbert,Penguin,,2025-03-05,Placed hold,City Library,eBook`

describe('Libby importer', () => {
  const r = parseLibby(LIBBY)
  it('groups events per title and skips magazines', () => {
    expect(r.candidates).toHaveLength(3)
    expect(r.skipped).toBe(1)
    const phm = r.candidates.find((c) => c.title === 'Project Hail Mary')!
    expect(phm.events.map((e) => e.type)).toEqual(['borrowed', 'returned'])
    expect(phm.activity).toBe('returned')
    expect(phm.format).toBe('audiobook')
  })
  it('never infers a finished book from a return', () => {
    expect(r.candidates.every((c) => c.status === undefined && !c.completionHint)).toBe(true)
  })
})

describe('Audible / Hoopla copied text', () => {
  it('parses Audible labelled blocks and explicit completion only', () => {
    const t = `Project Hail Mary\nBy: Andy Weir\nNarrated by: Ray Porter\nSeries: Hail Mary, Book 1\nLength: 16 hrs\nFinished\n\nCirce\nBy: Madeline Miller\nNarrated by: Perdita Weeks\nLength: 12 hrs`
    const { candidates } = parseListing(t, 'audible')
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({ title: 'Project Hail Mary', narrator: 'Ray Porter', series: 'Hail Mary', seriesNumber: 1, format: 'audiobook' })
    expect(candidates[0].completionHint?.value).toBe('finished')
    expect(candidates[1].completionHint).toBeUndefined()
  })
  it('skips non-book Hoopla media', () => {
    const t = `Gone Girl\nGillian Flynn\naudiobook\nBorrowed: 2025-01-02\n\nInception\nMovie\nBorrowed: 2025-01-03\n\nSaga Vol 1\nBrian K. Vaughan\ncomic`
    const r = parseListing(t, 'hoopla')
    expect(r.candidates.map((c) => c.title)).toEqual(['Gone Girl', 'Saga Vol 1'])
    expect(r.skippedMedia).toBe(1)
    expect(r.candidates[0].activity).toBe('borrowed')
  })
})

describe('screenshot (OCR) text layout', () => {
  it('turns OCR lines into candidates with doubt on low confidence', () => {
    const L = (text: string, top: number, conf = 90) => ({ text, conf, top, bottom: top + 20, left: 0 })
    const c = ocrLinesToCandidates([L('Project Hail Mary', 0), L('By: Andy Weir', 24), L('Circe', 120, 40), L('By: Madeline Miller', 144)], 'audible', 'Screenshot')
    expect(c.map((x) => x.title)).toEqual(['Project Hail Mary', 'Circe'])
    expect(c[0].confidence).toBeGreaterThan(c[1].confidence)
  })
})

import { readFileSync } from 'node:fs'
import { xlsxToCsv } from '../src/lib/importers/xlsx'

describe('Excel (.xlsx) import', () => {
  it('reads a real .xlsx, converts date serials, and feeds the Libby importer', async () => {
    const b = readFileSync(new URL('./fixtures/libby.xlsx', import.meta.url))
    const csv = await xlsxToCsv(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    expect(csv.split('\n')[0]).toContain('"title","author"')
    expect(csv).toContain('2025-02-')
    const r = parseLibby(csv)
    expect(r.candidates).toHaveLength(2)
    const phm = r.candidates.find((c) => c.title === 'Project Hail Mary')!
    expect(phm.events.map((e) => e.type)).toEqual(['borrowed', 'returned'])
    expect(phm.identifiers.isbn).toBe('9780593135204')
    expect(r.candidates.every((c) => c.status === undefined)).toBe(true)
  })
  it('rejects non-Excel files with a friendly error', async () => {
    await expect(xlsxToCsv(new TextEncoder().encode('not a zip at all').buffer as ArrayBuffer)).rejects.toThrow(/Excel/)
  })
})
