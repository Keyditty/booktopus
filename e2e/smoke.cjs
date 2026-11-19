// Browser smoke test: walks through adding/finishing books every way and checks the counters.
// Needs Playwright installed. Run:  npm run build && npx vite preview --port 4173 &  then  NODE_PATH=$(npm root -g) node e2e/smoke.cjs
const { chromium } = require('playwright'); const fs = require('fs')
const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   <-- ' + extra}`) }
;(async () => { const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'America/Chicago' })
  await ctx.route(/googleapis|openlibrary|inventaire|hardcover|covers\./, r => r.abort())
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  const go = async (h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(350) }
  const tiles = async () => { await go('stats'); return (await p.locator('div.grid.grid-cols-2.gap-3.text-center').first().innerText()).replace(/\n/g, ' ') }
  const n = (re, t) => { const m = t.match(re); return m ? +m[1] : -1 }
  const addManual = async (title, status, opts = {}) => {
    await go('import'); if (await p.getByRole('button', { name: 'Add another book' }).count()) await p.getByRole('button', { name: 'Add another book' }).click(); else await p.getByText('Add one book by hand').click(); await p.fill('#m-title', title)
    if (opts.author) await p.fill('#m-author', opts.author)
    if (status) await p.getByRole('button', { name: status, exact: true }).click()
    await p.getByRole('button', { name: 'Add to my shelf' }).click(); await p.waitForSelector('text=/Added to/', { timeout: 20000 })
  }

  // A. first run
  await p.goto(process.env.BASE || 'http://localhost:4173/'); await p.waitForSelector('[aria-label^="Tour"]')
  ck('A1 tour opens on first run', true); ck('A2 no sample books offered on first run', await p.getByText('Try sample books').count() === 0)
  await p.getByRole('button', { name: 'Skip tour' }).click(); await p.waitForTimeout(300)
  ck('A3 empty welcome screen after tour', await p.getByText(/Welcome/).count() > 0)

  // B. manual add finished
  await addManual('Book One', 'Finished')
  let t = await tiles(); console.log('     tiles:', t)
  ck('B1 finished=1', n(/(\d+) books? finished/, t) === 1, t); ck('B2 this year=1', n(/(\d+) in 20\d\d/, t) === 1, t); ck('B3 this month=1', n(/(\d+) this month/, t) === 1, t); ck('B4 library=1', n(/(\d+) in your library/, t) === 1, t)
  await go(''); ck('B5 Home strip counts it', await p.getByText(/1 of 24 books this year/).count() > 0)

  // C. want to read + reading
  await addManual('Book Two', 'Want to read'); await addManual('Book Three', 'Reading now')
  t = await tiles(); ck('C1 library=3, finished still 1', n(/(\d+) in your library/, t) === 3 && n(/(\d+) books? finished/, t) === 1, t)
  await go(''); await p.waitForTimeout(400)
  ck('C2 octopus holds the reading book', await p.locator('.slot', { hasText: 'Reading' }).count() === 1)
  await go('library'); const shelves = (await p.locator('nav[aria-label=Shelves]').innerText()).replace(/\n/g, ' ')
  ck('C3 shelf counts (Want 1, Reading 1, Finished 1)', /Reading 1/.test(shelves) && /Finished 1/.test(shelves) && /Want to Read 1/.test(shelves), shelves)

  // E. detail: finish Book Two
  await p.fill('input[type=search]', 'Book Two'); await p.waitForTimeout(300); await p.locator('.cell button').first().click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(350)
  await p.getByRole('button', { name: /Finished$/ }).first().click(); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.fill('input[type=search]', '')
  t = await tiles(); ck('E1 finishing from book page -> this year=2', n(/(\d+) in 20\d\d/, t) === 2 && n(/(\d+) this month/, t) === 2, t)

  // F. arm sheet finish
  await go(''); await p.locator('.slot', { hasText: 'Reading' }).first().click(); await p.getByRole('button', { name: /I finished it/ }).click(); await p.waitForTimeout(500)
  t = await tiles(); ck('F1 finishing from octopus arm -> this year=3', n(/(\d+) in 20\d\d/, t) === 3, t)
  await go(''); ck('F2 arm freed after finishing', await p.locator('.slot', { hasText: 'Reading' }).count() === 0)

  // G. paste import with finished heading (no dates)
  await p.evaluate(() => { location.hash = '' }); await p.getByRole('button', { name: /Add/ }).first().click(); await p.getByText('Paste a book list').click()
  await p.fill('textarea', '## Finished\n1. Imported A by Ann Smith\n2. Imported B by Bob Jones\n\n## Want to Read\n- Imported C by Cy Brown')
  await p.getByRole('button', { name: 'Find my books' }).click(); await p.waitForSelector('text=Check before adding', { timeout: 30000 })
  for (const el of await p.getByRole('button', { name: 'Select all' }).all()) await el.click().catch(() => {})
  await p.getByRole('button', { name: /^Add \d+ books?$/ }).click(); await p.waitForSelector('text=Your shelf is updated', { timeout: 20000 })
  t = await tiles(); ck('G1 import: finished=5 total', n(/(\d+) books? finished/, t) === 5, t); ck('G2 import (undated) not in this year yet', n(/(\d+) in 20\d\d/, t) === 3, t)
  ck('G3 undated panel explains it', await p.getByText(/2 finished books have no finish date/).count() > 0)
  await p.getByRole('button', { name: 'Add the dates' }).click(); for (const el of await p.getByRole('button', { name: 'Today', exact: true }).all()) await el.click(); await p.waitForTimeout(500)
  t = await tiles(); ck('G4 after dating them: this year=5, panel gone', n(/(\d+) in 20\d\d/, t) === 5 && await p.getByText(/have no finish date/).count() === 0, t)

  // H. Libby csv
  await p.evaluate(() => { location.hash = '' }); await p.getByRole('button', { name: /Add/ }).first().click(); await p.getByText('Import Libby history').click()
  await p.fill('textarea', 'title,author,isbn,timestamp,activity,library,format\nLibby Loan,Lia Boyd,,2026-11-01,Borrowed,City,eBook\nLibby Loan,Lia Boyd,,2026-11-10,Returned,City,eBook')
  await p.getByRole('button', { name: 'Find my books' }).click(); await p.waitForSelector('text=Check before adding', { timeout: 30000 })
  for (const el of await p.getByRole('button', { name: 'Select all' }).all()) await el.click().catch(() => {})
  await p.getByRole('button', { name: /^Add \d+ books?$/ }).click(); await p.waitForSelector('text=Your shelf is updated', { timeout: 20000 })
  t = await tiles(); ck('H1 Libby loan adds to library but NOT to finished', n(/(\d+) in your library/, t) === 7 && n(/(\d+) books? finished/, t) === 5, t)

  // I. levels
  await go('stats'); await p.getByText(/See all 8 levels/).click(); await p.waitForTimeout(350)
  ck('I1 levels sheet lists 8 and ends at 1,000', await p.locator('[aria-label="All levels"] li').count() === 8 && await p.getByText(/1,000 books finished/).count() > 0); await p.getByRole('button', { name: 'Close' }).click()

  // L. series fallback
  await go('library'); await p.locator('.cell button').first().click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(350)
  await p.getByText('See the whole series').click(); await p.waitForSelector('text=See the series on Google', { timeout: 20000 })
  ck('L1 series falls back to Google, no scary errors up front', await p.getByText(/Hardcover skipped|no token/i).count() === 0 && await p.locator('a[href*="google.com/search"]').count() > 0)
  await p.getByRole('button', { name: 'Close' }).click(); await p.keyboard.press('Escape')

  // J. backup + erase + restore
  await go('settings'); const dl = p.waitForEvent('download'); await p.getByRole('button', { name: /Download backup/ }).first().click(); const d = await dl; const bp = S + '/backup.json'; await d.saveAs(bp)
  ck('J1 backup downloads with all 7 books', JSON.parse(fs.readFileSync(bp, 'utf8')).books.length === 7)
  await p.getByRole('button', { name: /Erase library/ }).click(); await p.fill('#erase-confirm', 'ERASE'); await p.getByRole('button', { name: 'Erase everything' }).click(); await p.waitForTimeout(500)
  t = await tiles(); ck('J2 erase empties the library', n(/(\d+) in your library/, t) === 0, t)
  await go('settings'); await p.locator('input[type=file][accept*=json]').first().setInputFiles(bp); await p.waitForTimeout(600)
  t = await tiles(); ck('J3 restore brings everything back (7 books, 5 finished, 5 this year)', n(/(\d+) in your library/, t) === 7 && n(/(\d+) books? finished/, t) === 5 && n(/(\d+) in 20\d\d/, t) === 5, t)

  // N. persistence
  await p.reload(); await p.waitForTimeout(600); t = await tiles(); ck('N1 survives reload', n(/(\d+) in your library/, t) === 7, t)
  // spice + filter
  await go('library'); await p.locator('.cell button').first().click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(350); await p.getByRole('radio', { name: /Spice 4 of 5/ }).click(); await p.waitForTimeout(250); await p.keyboard.press('Escape')
  await p.getByRole('button', { name: /^Filter/ }).click(); await p.locator('select').filter({ hasText: '5 only' }).selectOption('3'); await p.waitForTimeout(300)
  ck('M1 spice filter (3+) shows just the spicy book', await p.locator('.cell').count() === 1, String(await p.locator('.cell').count()))
  console.log('\nconsole errors:', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
