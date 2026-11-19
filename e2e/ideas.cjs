// Browser smoke test #4: 'Find more to read' (type your own author / genre / mood / book).
// Run:  npx vite preview --port 4186 &  then  NODE_PATH=$(npm root -g) node e2e/ideas.cjs
const { chromium } = require('playwright'); const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '   <-- ' + x}`) }
const J = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })
;(async () => { const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const asked = []
  await ctx.route('https://www.googleapis.com/**', r => { asked.push(decodeURIComponent(r.request().url())); const u = r.request().url()
    r.fulfill(J({ items: u.includes('subject') ? [] : [{ id: 'g1', volumeInfo: { title: 'A Court of Thorns and Roses', authors: ['Sarah J. Maas'], publishedDate: '2015-05-05' } }, { id: 'g2', volumeInfo: { title: 'Fourth Wing', authors: ['Rebecca Yarros'], publishedDate: '2023-05-02' } }] })) })
  await ctx.route(/openlibrary|inventaire|hardcover|covers\./, r => r.abort())
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => { if (!localStorage.getItem('booktopus-settings')) localStorage.setItem('booktopus-settings', JSON.stringify({ tourDone: true })) })
  await p.goto(process.env.BASE || 'http://localhost:4186/'); await p.waitForTimeout(400); await p.evaluate(() => { location.hash = 'stats' }); await p.waitForTimeout(400)
  const sec = p.locator('section[aria-label="Find more books"]')
  ck('1a the section is there even on an empty shelf, with a box to type in', await sec.locator('input[aria-label="What do you want to find?"]').count() === 1)
  await sec.getByRole('radio', { name: /Genre or mood/ }).click(); await sec.locator('input').fill('spicy fantasy'); await sec.getByRole('button', { name: 'Find', exact: true }).click(); await p.waitForTimeout(300)
  ck('2a typing a genre/mood makes a card for exactly that', await sec.getByText('More “spicy fantasy”').count() === 1)
  const href = await sec.locator('a', { hasText: 'Google' }).first().getAttribute('href'); ck('2b its web links search for what she typed', /spicy%20fantasy/.test(href || ''), href)
  await sec.getByRole('button', { name: 'Show ideas here' }).first().click(); await p.waitForTimeout(700)
  ck('2c "Show ideas here" returns books for a made-up genre (keyword fallback)', await sec.getByText('A Court of Thorns and Roses').count() >= 1 && asked.some(u => /q=spicy fantasy/.test(u) && !/subject/.test(u)), asked.join(' | '))
  await sec.getByRole('radio', { name: /Author/ }).click(); await sec.locator('input').fill('Sarah J. Maas'); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
  ck('3a author mode (Enter works) adds a card on top', await sec.getByText('More by Sarah J. Maas').count() === 1)
  await sec.getByRole('radio', { name: /Books like/ }).click(); await sec.locator('input').fill('A Court of Thorns and Roses'); await sec.getByRole('button', { name: 'Find', exact: true }).click(); await p.waitForTimeout(300)
  ck('4a "Books like…" gives web links for that title', /books%20like%20A%20Court/.test(await sec.locator('a', { hasText: 'Goodreads' }).first().getAttribute('href').catch(() => '') || '') || await sec.getByText('Books like “A Court of Thorns and Roses”').count() === 1)
  await sec.getByRole('button', { name: /Remove More “spicy fantasy”/ }).click(); ck('5a Remove deletes a card', await sec.getByText('More “spicy fantasy”').count() === 0)
  await sec.scrollIntoViewIfNeeded(); await sec.screenshot({ path: S + '/ideas.png' })
  // her own genres appear as one-tap chips
  await p.evaluate(() => { location.hash = 'import' }); await p.getByText('Add one book by hand').click(); await p.fill('#m-title', 'Romance Test'); await p.fill('input[aria-label="Add a genre"]', 'Romantasy'); await p.keyboard.press('Enter'); await p.getByRole('button', { name: 'Add to my shelf' }).click(); await p.waitForSelector('text=/Added to/')
  await p.evaluate(() => { location.hash = 'stats' }); await p.waitForTimeout(400)
  ck('6a her own genres show as one-tap chips', await sec.getByRole('button', { name: 'Romantasy', exact: true }).count() === 1)
  await sec.getByRole('button', { name: 'Romantasy', exact: true }).click(); await p.waitForTimeout(250); ck('6b tapping a genre chip starts that search', await sec.getByText('More “Romantasy”').count() === 1)
  console.log('errors', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
