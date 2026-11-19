// Browser smoke test #3: Reef drill-downs (tap a month / year / genre to see the books) and the genre picker's Done button.
// Run:  npx vite preview --port 4184 &  then  NODE_PATH=$(npm root -g) node e2e/reef.cjs
const { chromium } = require('playwright'); const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   <-- ' + extra}`) }
;(async () => { const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ctx.route(/googleapis|openlibrary|inventaire|hardcover|covers\./, r => r.abort())
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => localStorage.setItem('booktopus-settings', JSON.stringify({ tourDone: true })))
  await p.goto(process.env.BASE || 'http://localhost:4184/'); await p.waitForTimeout(400)
  const go = async (h) => { await p.evaluate((x) => { location.hash = x }, h); await p.waitForTimeout(350) }
  const add = async (title, genre) => { await go('import'); if (await p.getByRole('button', { name: 'Add another book' }).count()) await p.getByRole('button', { name: 'Add another book' }).click(); else await p.getByText('Add one book by hand').click()
    await p.fill('#m-title', title); await p.fill('input[aria-label="Add a genre"]', genre); await p.keyboard.press('Enter'); await p.getByRole('button', { name: 'Finished', exact: true }).click()
    await p.getByRole('button', { name: 'Add to my shelf' }).click(); await p.waitForSelector('text=/Added to/', { timeout: 20000 }) }
  await add('Alpha Book', 'Romantasy'); await add('Beta Book', 'Fantasy'); await add('Gamma Book', 'Fantasy')
  await go('stats'); await p.waitForTimeout(400)
  // month bar
  const monthBtn = p.locator('[aria-label="Books per month"] button:not([disabled])').first()
  ck('1a the current month bar is clickable and says how many', /3 books/.test(await monthBtn.getAttribute('aria-label')), await monthBtn.getAttribute('aria-label'))
  ck('1b hover tooltip lists the titles', /Alpha Book/.test(await monthBtn.getAttribute('title') || ''), await monthBtn.getAttribute('title'))
  await monthBtn.click(); await p.waitForTimeout(300)
  const region = p.locator('[aria-label="Books per month"] [role=region]'); const rt = await region.innerText().catch(() => '')
  ck('1c tapping the month shows the 3 books', /Alpha Book/.test(rt) && /Beta Book/.test(rt) && /Gamma Book/.test(rt), rt); await p.screenshot({ path: S + '/r-month.png', fullPage: false })
  await region.getByRole('button', { name: 'Close' }).click(); ck('1d Close hides the list', await region.count() === 0)
  // year
  await p.locator('[aria-label="Books per year"] button').first().click(); await p.waitForTimeout(250); ck('2a tapping the year shows its books', /Gamma Book/.test(await p.locator('[aria-label="Books per year"] [role=region]').innerText().catch(() => '')))
  // genre
  await p.locator('[aria-label="Genres"] button', { hasText: 'Romantasy' }).first().click(); await p.waitForTimeout(250)
  const gt = await p.locator('[aria-label="Genres"] [role=region]').innerText().catch(() => ''); ck('3a tapping a genre shows only its books', /Alpha Book/.test(gt) && !/Beta Book/.test(gt), gt)
  await p.locator('[aria-label="Genres"] button', { hasText: /^Fantasy/ }).first().click(); await p.waitForTimeout(250)
  const gt2 = await p.locator('[aria-label="Genres"] [role=region]').innerText().catch(() => ''); ck('3b Fantasy shows Beta + Gamma', /Beta Book/.test(gt2) && /Gamma Book/.test(gt2) && !/Alpha Book/.test(gt2), gt2); await p.locator('[aria-label="Genres"]').screenshot({ path: S + '/r-genre.png' })
  await p.locator('[aria-label="Genres"] [role=region] li button').first().click(); await p.waitForSelector('[role=dialog]'); ck('3c tapping a listed book opens it', await p.getByRole('dialog').count() > 0)
  // genre picker Done
  await p.getByRole('button', { name: /＋ Genre/ }).click(); await p.waitForTimeout(250); ck('4a picker opens with a Done button', await p.getByRole('button', { name: 'Done', exact: true }).count() >= 1)
  await p.fill('input[aria-label="Add a genre"]', 'Dark Romance'); await p.getByRole('button', { name: 'Done', exact: true }).last().click(); await p.waitForTimeout(300)
  ck('4b Done closes the picker', await p.locator('input[aria-label="Add a genre"]').count() === 0); ck('4c and saves a genre that was typed but not yet added', /Dark Romance/.test(await p.getByRole('dialog').innerText()))
  console.log('errors', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
