// Browser smoke test #5: Hardcover token entry on a phone (messy paste cleaned, Show button, friendly errors).
// Run:  npx vite preview --port 4187 &  then  NODE_PATH=$(npm root -g) node e2e/token.cjs
const { chromium, devices } = require('playwright'); const S = process.argv[2] || require('os').tmpdir(); let pass = 0, fail = 0
const ck = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '   <-- ' + x}`) }
const J = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })
;(async () => { const b = await chromium.launch(); const errs = []
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }); let mode = 'limited'; const auth = []
  await ctx.route('https://api.hardcover.app/**', r => { auth.push(r.request().headers()['authorization']); const body = JSON.parse(r.request().postData()); 
    if (mode === 'blocked') return r.fulfill(J({ errors: [{ message: 'insufficient_scope' }] }))
    if (body.query.includes('me {')) return r.fulfill(J({ errors: [{ message: 'insufficient_scope' }] }))
    return r.fulfill(J({ data: { series: [{ id: 1, name: 'Dune' }] } })) })
  await ctx.route(/googleapis|openlibrary|inventaire|covers\./, r => r.abort())
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => { if (!localStorage.getItem('booktopus-settings')) localStorage.setItem('booktopus-settings', JSON.stringify({ tourDone: true })) })
  await p.goto((process.env.BASE || 'http://localhost:4187/') + '#settings'); await p.waitForTimeout(600)
  const f = p.locator('#hc-token'); await f.fill('Bearer  eyJhbGci\n.payload  \n.sig​nature '); await f.blur(); await p.waitForTimeout(200)
  ck('1a the field is a password box by default', await f.getAttribute('type') === 'password')
  await p.getByRole('button', { name: 'Show' }).click(); ck('1b Show reveals it', await f.getAttribute('type') === 'text')
  ck('1c a messy paste is cleaned (no spaces, line breaks, invisible chars, "Bearer")', await f.inputValue() === 'eyJhbGci.payload.signature', await f.inputValue())
  ck('1d it says how many characters are saved', await p.getByText(/26 characters saved/).count() === 1)
  await p.getByRole('button', { name: 'Test Hardcover' }).click(); await p.waitForSelector('text=Connected', { timeout: 8000 })
  ck('2a a token limited to book data now passes the test (this was the failure on the phone)', true); ck('2b what is sent is the clean token', auth.every(a => a === 'Bearer eyJhbGci.payload.signature'), auth.join('|'))
  mode = 'blocked'; await p.getByRole('button', { name: 'Test Hardcover' }).click(); await p.waitForSelector('text=fresh token', { timeout: 8000 })
  ck('3a a fully blocked token gets a plain-English fix, with the raw code kept for troubleshooting', /fresh token/.test(await p.locator('[role=status]').first().innerText()) && /insufficient_scope/.test(await p.locator('[role=status]').first().innerText()))
  await p.locator('[role=status]').first().scrollIntoViewIfNeeded(); await p.locator('section', { hasText: 'Series & universe lookups' }).screenshot({ path: S + '/token.png' })
  console.log('errors', errs); console.log(`\n${pass} passed, ${fail} failed`); await b.close() })().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1) })
