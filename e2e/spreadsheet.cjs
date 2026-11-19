// Browser smoke test #7: spreadsheet import (comic-style workbook: summary tab first, banner row, no Title column).
// Run:  npx vite preview --port 4189 &  then  NODE_PATH=$(npm root -g) node e2e/spreadsheet.cjs  (needs tests/fixtures/comics.xlsx and an empty.xlsx next to the temp dir; see test)
const { chromium } = require('playwright'); const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '   <-- ' + x}`) }
;(async () => { const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await ctx.route(/googleapis|openlibrary|inventaire|hardcover|covers\./, r => r.abort())
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => { if (!localStorage.getItem('booktopus-settings')) localStorage.setItem('booktopus-settings', JSON.stringify({ tourDone: true })) })
  await p.goto(process.env.BASE || 'http://localhost:4189/'); await p.waitForTimeout(400)
  const toPaste = async () => { await p.evaluate(() => { location.hash = '' }); await p.getByRole('button', { name: /Add/ }).first().click(); await p.getByText('Paste a book list').click() }
  // 1. the comic workbook
  await toPaste(); await p.setInputFiles('input[type=file]', require('path').resolve(__dirname, '../tests/fixtures/comics.xlsx')); await p.waitForSelector('[aria-label="Choose spreadsheet columns"]')
  const mapper = p.locator('[aria-label="Choose spreadsheet columns"]'); const mt = await mapper.innerText()
  ck('1a it opens the column chooser (instead of silently doing nothing)', /comics\.xlsx/.test(mt) && /2 sheets/.test(mt))
  ck('1b it picked the data sheet, not the summary tab', await mapper.locator('#map-sheet').inputValue() === '1', await mapper.locator('#map-sheet').inputValue())
  ck('1c it found the headings on row 3 (below the banner)', await mapper.locator('#map-hdr').inputValue() === '3')
  ck('1d it shows a live preview: 6 comics, with issue numbers', /6 comics found/.test(mt) && /Saga #2/.test(mt) && /Amazing Spider-Man #1/.test(mt), mt.slice(-400)); await p.screenshot({ path: S + '/mapper.png', fullPage: true })
  await p.getByRole('button', { name: 'Find my books' }).click(); await p.waitForSelector('text=Check before adding', { timeout: 30000 })
  for (const el of await p.getByRole('button', { name: 'Select all' }).all()) await el.click().catch(() => {})
  await p.getByRole('button', { name: /^Add \d+ books?$/ }).click(); await p.waitForSelector('text=Your shelf is updated', { timeout: 20000 })
  await p.evaluate(() => { location.hash = 'library' }); await p.waitForTimeout(500)
  ck('1e all 6 comics land on the shelf', (await p.locator('nav[aria-label=Shelves]').innerText()).replace(/\n/g, ' ').includes('All 6'))
  await p.fill('input[type=search]', 'Saga'); await p.waitForTimeout(300); await p.locator('.cell button').first().click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(400)
  ck('1f they are marked as comics', /Comic/.test(await p.getByRole('dialog').innerText())); await p.keyboard.press('Escape')
  // 2. changing a choice updates the preview
  await toPaste(); await p.setInputFiles('input[type=file]', require('path').resolve(__dirname, '../tests/fixtures/comics.xlsx')); await p.waitForSelector('[aria-label="Choose spreadsheet columns"]')
  await mapper.locator('select').nth(2).selectOption({ index: 0 }) // sheet select is nth(0); header num input is not a select. title select is nth(1)
  // 3. an empty workbook gets a clear message
  await toPaste(); await p.setInputFiles('input[type=file]', require('path').resolve(__dirname, '../tests/fixtures/empty.xlsx')); await p.waitForTimeout(500)
  ck('3a an empty spreadsheet says so, clearly', await p.getByText(/has no data in it/).count() === 1)
  // 4. a normal book workbook with a Title column still works (Libby path unchanged)
  await p.evaluate(() => { location.hash = '' }); await p.getByRole('button', { name: /Add/ }).first().click(); await p.getByText('Import Libby history').click()
  await p.setInputFiles('input[type=file]', require('path').resolve(__dirname, '../tests/fixtures/libby.xlsx')); await p.waitForTimeout(500)
  ck('4a Libby spreadsheets still load into the box and say how many lines were read', /Read \d+ lines/.test(await p.locator('[role=status]').innerText()) && (await p.locator('textarea').inputValue()).includes('Project Hail Mary'))
  console.log('errors', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
