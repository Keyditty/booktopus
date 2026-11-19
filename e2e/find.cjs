// Browser smoke test #6: 'Find any book' author search (the 'steven king' typo): famous author first, spelling variants, author suggestions, All/Title/Author.
// Run:  npx vite preview --port 4188 &  then  NODE_PATH=$(npm root -g) node e2e/find.cjs
const { chromium } = require('playwright'); const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '   <-- ' + x}`) }
const J = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })
;(async () => { const b = await chromium.launch(); const errs = []; const asked = []
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ctx.route('https://www.googleapis.com/**', r => { const u = decodeURIComponent(r.request().url()); asked.push(u)
    if (/inauthor:"Stephen king"/i.test(u) || /inauthor:"Stephen King"/.test(u)) return r.fulfill(J({ items: [{ id: 'k1', volumeInfo: { title: 'The Shining', authors: ['Stephen King'], publishedDate: '1977', ratingsCount: 90000 } }, { id: 'k2', volumeInfo: { title: 'It', authors: ['Stephen King'], publishedDate: '1986', ratingsCount: 120000 } }] }))
    return r.fulfill(J({ items: [{ id: 'j1', volumeInfo: { title: 'Dracula', authors: ['steven king'], publishedDate: '2022' } }, { id: 'j2', volumeInfo: { title: 'Al Pacino!', authors: ['Steven King'], publishedDate: '2018' } }, { id: 'j3', volumeInfo: { title: 'A Fulde Country Practice', authors: ['Steven King'], publishedDate: '2001', ratingsCount: 2 } }] })) })
  await ctx.route('https://openlibrary.org/search/authors.json**', r => { const u = decodeURIComponent(r.request().url()); r.fulfill(J({ docs: /Stephen king/i.test(u) ? [{ name: 'Stephen King', work_count: 2100, top_work: 'The Shining' }] : [{ name: 'Steven King', work_count: 4 }] })) })
  await ctx.route(/openlibrary.org\/search\.json|inventaire|hardcover|covers\./, r => r.abort())
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => { if (!localStorage.getItem('booktopus-settings')) localStorage.setItem('booktopus-settings', JSON.stringify({ tourDone: true })) })
  await p.goto(process.env.BASE || 'http://localhost:4188/'); await p.waitForTimeout(400)
  await p.getByRole('radio', { name: /Find any book/ }).click(); await p.fill('input[type=search]', 'steven king'); await p.waitForSelector('text=The Shining', { timeout: 10000 }); await p.waitForTimeout(400)
  const titles = await p.locator('main li .serif').allInnerTexts()
  ck('1a the real Stephen King books come first (the "steven king" typo problem)', /Shining|^It$/.test(titles[0]) && titles.slice(0, 2).every(t => /Shining|^It$/.test(t)), titles.join(' | '))
  ck('1b namesakes are still listed, just lower down', titles.includes('Dracula'))
  ck('1c it also tried the Stephen spelling', asked.some(u => /inauthor:"Stephen king"/i.test(u)), asked.join('\n'))
  ck('1d "Looking for an author?" suggests Stephen King with his work count', await p.getByRole('button', { name: /Stephen King · 2,100 works/ }).count() === 1); await p.screenshot({ path: S + '/find-king.png' })
  ck('2a there is an All / Title / Author switch', await p.getByRole('radio', { name: 'Author' }).count() === 1 && await p.getByRole('radio', { name: 'Title' }).count() === 1)
  await p.getByRole('button', { name: /Stephen King · 2,100 works/ }).click(); await p.waitForTimeout(900)
  ck('3a tapping the author suggestion switches to author mode and searches that exact name', await p.locator('input[type=search]').inputValue() === 'Stephen King' && await p.getByRole('radio', { name: 'Author', checked: true }).count() === 1)
  ck('3b the list is only his books', (await p.locator('main li .serif').allInnerTexts()).every(t => /Shining|^It$/.test(t)))
  console.log('errors', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
