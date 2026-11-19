// Browser smoke test #2: editing where a book lives, the series tracker, series saved from a lookup, Surprise me (Inventaire is faked).
// Run like e2e/smoke.cjs but on port 4183:  npx vite preview --port 4183 &  then  NODE_PATH=$(npm root -g) node e2e/features.cjs
const { chromium } = require('playwright'); const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   <-- ' + extra}`) }
const J = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })
;(async () => { const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ctx.route(/googleapis|openlibrary|hardcover|covers\./, r => r.abort())
  await ctx.route('https://inventaire.io/**', r => { const u = r.request().url()
    if (u.includes('/search')) return r.fulfill(J({ results: u.includes('types=works') ? [{ id: 'Q2', uri: 'wd:Q2', label: 'Fourth Wing' }] : [{ id: 'Q1', uri: 'wd:Q1', label: 'The Empyrean' }] }))
    if (u.includes('series-parts')) return r.fulfill(J({ parts: [{ uri: 'wd:Q2', ordinal: '1' }, { uri: 'wd:Q3', ordinal: '2' }, { uri: 'wd:Q4', ordinal: '3' }] }))
    return r.fulfill(J({ entities: { 'wd:Q1': { labels: { en: 'The Empyrean' } }, 'wd:Q2': { labels: { en: 'Fourth Wing' }, claims: { 'wdt:P179': ['wd:Q1'] } }, 'wd:Q3': { labels: { en: 'Iron Flame' } }, 'wd:Q4': { labels: { en: 'Onyx Storm' } } } })) })
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => localStorage.setItem('booktopus-settings', JSON.stringify({ tourDone: true })))
  await p.goto(process.env.BASE || 'http://localhost:4183/'); await p.waitForTimeout(400)
  const go = async (h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(350) }
  const add = async (title, status, series, num, whereSel) => {
    await go('import'); if (await p.getByRole('button', { name: 'Add another book' }).count()) await p.getByRole('button', { name: 'Add another book' }).click(); else await p.getByText('Add one book by hand').click()
    await p.fill('#m-title', title); if (status) await p.getByRole('button', { name: status, exact: true }).click()
    if (whereSel) await p.selectOption('#m-where', whereSel)
    await p.getByRole('button', { name: 'Add to my shelf' }).click(); await p.waitForSelector('text=/Added to/', { timeout: 20000 }) }
  const openBook = async (title) => { await go('library'); await p.fill('input[type=search]', title); await p.waitForTimeout(300); await p.locator('.cell button').first().click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(400) }

  // 1. edit where it lives
  await add('Where Test Book', 'Finished', null, null, 'audible'); await openBook('Where Test')
  ck('1a starts as Audible', await p.locator('[aria-label="Where you have it"]').innerText().then(t => /Audible/.test(t)))
  await p.locator('[aria-label="Where you have it"]').getByRole('button', { name: 'Change' }).click()
  await p.locator('[aria-label="Where you have it"] select').nth(0).selectOption('libby'); await p.locator('[aria-label="Where you have it"] select').nth(1).selectOption('ebook'); await p.waitForTimeout(400)
  const t1 = await p.locator('[aria-label="Where you have it"]').innerText(); ck('1b changed to Libby ebook', /Libby/.test(t1) && /Ebook/.test(t1), t1)
  await p.getByRole('button', { name: '＋ Add another place' }).click(); await p.locator('[aria-label="Where you have it"] .card select').nth(0).selectOption('audible'); await p.locator('[aria-label="Where you have it"] .card select').nth(1).selectOption('audiobook')
  await p.locator('[aria-label="Where you have it"] .card').getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForTimeout(400)
  const t2 = await p.locator('[aria-label="Where you have it"]').innerText(); ck('1c now lives in two places', /Libby/.test(t2) && /Audible/.test(t2), t2)
  await p.screenshot({ path: S + '/s-sources.png' }); await p.keyboard.press('Escape')

  // 2. series tracker from typed series info
  const addSeries = async (title, num, status) => { await go('library'); await go('import'); if (await p.getByRole('button', { name: 'Add another book' }).count()) await p.getByRole('button', { name: 'Add another book' }).click(); else await p.getByText('Add one book by hand').click()
    await p.fill('#m-title', title); await p.fill('#m-series', 'Test Saga'); await p.fill('#m-sno', String(num)); await p.getByRole('button', { name: status, exact: true }).click(); await p.getByRole('button', { name: 'Add to my shelf' }).click(); await p.waitForSelector('text=/Added to/', { timeout: 20000 }) }
  await addSeries('Saga One', 1, 'Finished'); await addSeries('Saga Three', 3, 'Want to read')
  await go('series'); await p.waitForTimeout(500)
  const sv = await p.locator('main').last().innerText()
  ck('2a series card shows Test Saga with 1 finished, 2 on shelf', /Test Saga/.test(sv) && /1 finished · 2 on your shelf/.test(sv), sv.slice(0, 200))
  ck('2b gap detected: Book 2 is the next one up, not on shelf', /Next up · Book 2/i.test(sv) && /Not on your shelf yet/.test(sv), sv.slice(0, 300))
  await p.screenshot({ path: S + '/s-series.png' })
  await go(''); await p.waitForTimeout(500); ck('2c Home shows Keep going row', await p.getByText('Keep going').count() > 0)

  // 3. series saved from a lookup (Inventaire mocked): books w/o series get tagged
  await add('Fourth Wing', 'Finished'); await add('Iron Flame', 'Want to read')
  await openBook('Fourth Wing'); await p.getByText('See the whole series').click(); await p.waitForSelector('text=Onyx Storm', { timeout: 15000 }); await p.waitForTimeout(500)
  ck('3a lookup tags your books', await p.getByText(/Saved series info for 2 of your books/).count() > 0)
  await p.getByRole('button', { name: 'Close' }).click(); await p.keyboard.press('Escape')
  await go('series'); await p.waitForTimeout(700); const sv2 = await p.locator('main').last().innerText()
  ck('3b Empyrean appears in the tracker with the full size (3) and next = Iron Flame', /The Empyrean/.test(sv2) && /1 of 3 finished/.test(sv2) && /Iron Flame/.test(sv2), sv2.slice(0, 400))

  // 4. surprise me
  await go(''); await p.getByRole('button', { name: /Surprise me/ }).click(); await p.waitForSelector('[aria-label="Surprise pick"]')
  ck('4a surprise shows a book from the want pile', await p.getByText('From your Want to read pile').count() > 0); await p.screenshot({ path: S + '/s-surprise.png' })
  await p.getByRole('button', { name: /Put it Up next/ }).click(); await p.waitForTimeout(500)
  ck('4b picking puts it on an octopus arm (Up next)', await p.locator('.slot', { hasText: 'Up next' }).count() >= 1)
  console.log('errors', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
