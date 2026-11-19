import { useRef, useState } from 'react'
import { download, downloadBackup, eraseAll, exportCsv, restoreJson } from '../lib/export'
import { Portal } from './Portal'
import { getSettings, saveSettings, type ThemeName } from '../lib/settings'
import { undoBatch } from '../lib/store'
import { loadSampleBooks } from '../lib/sample'
import { cleanToken, testHardcover, testInventaire, type TestOutcome } from '../lib/series'
import { VISION_MODEL } from '../lib/settings'
import type { ImportBatch } from '../types'

export function EraseDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [saved, setSaved] = useState(false)
  const ok = typed.trim().toUpperCase() === 'ERASE'
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 fade-in" role="alertdialog" aria-modal="true" aria-labelledby="erase-title" aria-describedby="erase-desc" onClick={onClose}>
        <div className="card sheet-in w-full max-w-md p-5" style={{ background: 'var(--c-sea)', borderColor: 'var(--c-rust)' }} onClick={(e) => e.stopPropagation()}>
          <h3 id="erase-title" className="text-xl font-bold text-rust">⚠️ Erase your whole library?</h3>
          <p id="erase-desc" className="mt-2 text-sm">This permanently deletes all <strong>{count} books</strong>, your ratings, notes, dates, octopus arms, points and import history from this device. <strong>This cannot be undone.</strong> Your goals, name and settings are kept.</p>
          <div className="mt-4 rounded-xl bg-mist p-3 text-sm">
            <p className="font-semibold">Strongly recommended: save a backup first.</p>
            <button className="btn btn-primary mt-2 !min-h-10 text-sm" onClick={async () => { await downloadBackup(); setSaved(true) }}>Download backup (JSON)</button>
            {saved && <p role="status" className="mt-2 text-xs text-sage">✓ Backup downloaded. Keep that file somewhere safe.</p>}
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="erase-confirm">Type <span className="font-mono text-rust">ERASE</span> to confirm</label>
          <input id="erase-confirm" className="field mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button className="btn btn-primary" onClick={onClose}>Keep my library</button>
            <button className="btn btn-ghost !border-rust text-rust" disabled={!ok} onClick={async () => { await eraseAll(); onClose() }}>Erase everything</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

export function History({ batches }: { batches: ImportBatch[] }) {
  return (
    <div className="mx-auto max-w-2xl fade-in">
      <h2 className="text-2xl font-bold">Import history</h2>
      <p className="text-sm text-muted">Every import is saved as a batch you can undo. Undoing removes the books and records that batch added.</p>
      <ul className="mt-4 space-y-2">
        {batches.map((b) => (
          <li key={b.id} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{b.label}</div>
              <div className="text-xs text-muted">{new Date(b.createdAt).toLocaleString()} · {b.booksCreated} new, {b.booksMerged} updated, {b.events} activity entries{b.undone ? ' · undone' : ''}</div>
            </div>
            {!b.undone && <button className="btn btn-ghost !min-h-9 !py-1 text-sm" onClick={() => confirm('Undo this import?') && undoBatch(b.id)}>Undo</button>}
          </li>
        ))}
        {!batches.length && <li className="card p-6 text-center text-muted">No imports yet.</li>}
      </ul>
    </div>
  )
}

export function SettingsView({ bookCount, onChanged, onTheme, name, onName, goals, onGoals, onTour }: { bookCount: number; onChanged: () => void; onTheme: (t: ThemeName) => void; name: string; onName: (n: string) => void; goals: { yearly: number; monthly: number }; onGoals: (g: { yearly: number; monthly: number }) => void; onTour: () => void }) {
  const [s, setS] = useState(getSettings())
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [erasing, setErasing] = useState(false)
  const [showHc, setShowHc] = useState(false)
  const [tests, setTests] = useState<Record<string, TestOutcome | 'running'>>({})
  const runTest = async (id: string, fn: () => Promise<TestOutcome>) => { setTests((t) => ({ ...t, [id]: 'running' })); const r = await fn(); setTests((t) => ({ ...t, [id]: r })) }
  const TestLine = ({ id }: { id: string }) => { const t = tests[id]; return t ? <p role="status" className={`mt-2 text-sm ${t === 'running' ? 'text-muted' : t.ok ? 'text-sage' : 'text-rust'}`}>{t === 'running' ? 'Testing…' : `${t.ok ? '✓' : '✗'} ${t.message}${t.ms ? ` (${t.ms} ms)` : ''}`}</p> : null }
  const upd = (p: Partial<typeof s>) => { setS({ ...s, ...p }); saveSettings(p) }
  const stamp = new Date().toISOString().slice(0, 10)
  return (
    <div className="mx-auto max-w-2xl space-y-6 fade-in">
      {erasing && <EraseDialog count={bookCount} onClose={() => setErasing(false)} />}
      <h2 className="text-2xl font-bold">Settings &amp; backup</h2>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Your name</h3>
        <label className="mt-2 block text-xs font-semibold text-muted" htmlFor="s-name">Shown in the greeting and header
          <input id="s-name" className="field mt-1 font-normal text-ink" defaultValue={name} onBlur={(e) => onName(e.target.value)} autoComplete="given-name" /></label>
        <h3 className="mt-5 text-lg font-bold">Reading goals</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-muted" htmlFor="g-year">Books per year
            <input id="g-year" type="number" min={1} max={365} className="field mt-1 font-normal text-ink" defaultValue={goals.yearly} onBlur={(e) => onGoals({ ...goals, yearly: Math.max(1, Math.min(365, +e.target.value || goals.yearly)) })} /></label>
          <label className="block text-xs font-semibold text-muted" htmlFor="g-month">Books per month
            <input id="g-month" type="number" min={1} max={31} className="field mt-1 font-normal text-ink" defaultValue={goals.monthly} onBlur={(e) => onGoals({ ...goals, monthly: Math.max(1, Math.min(31, +e.target.value || goals.monthly)) })} /></label>
        </div>
        <h3 className="mt-5 text-lg font-bold">Ocean</h3>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Color theme">
          {([['deep', '🌌 Deep Sea'], ['lagoon', '🏝️ Sunlit Lagoon']] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={s.theme === k} className={`btn ${s.theme === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { upd({ theme: k }); onTheme(k) }}>{l}</button>
          ))}
        </div>
      </section>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Your data</h3>
        <p className="mt-1 text-sm text-muted">Your library is stored privately in this browser on this device. {bookCount} books. To use it on your phone <em>and</em> computer, export a backup here and restore it on the other device.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => downloadBackup()}>Download backup (JSON)</button>
          <button className="btn btn-ghost" onClick={async () => download(`booktopus-${stamp}.csv`, await exportCsv(), 'text/csv')}>Export spreadsheet (CSV)</button>
          <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return
            try { setMsg(`Restored ${await restoreJson(await f.text())} books.`) } catch (err) { setMsg((err as Error).message) }
            e.target.value = ''
          }} />
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Restore from backup…</button>
        </div>
        {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
      </section>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Covers &amp; details</h3>
        <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]" checked={s.lookupOnline} onChange={(e) => upd({ lookupOnline: e.target.checked })} />
          <span>Look up covers and descriptions online (Google Books &amp; Open Library). Only titles and authors are sent.</span></label>
        <label className="mt-4 block text-xs font-semibold text-muted">Google Books API key (optional — avoids rate limits)
          <input className="field mt-1 font-normal text-ink" type="password" autoComplete="off" value={s.googleKey} onChange={(e) => upd({ googleKey: e.target.value })} /></label>
      </section>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Series & universe lookups <span className="ml-1 rounded-full bg-gold px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-[#2b1d12]">Experimental</span></h3>
        <p className="mt-1 text-sm text-muted">Shows every book in a series (open any book and tap “See the whole series”). Inventaire needs nothing. Hardcover is better for new popular books and needs a free token from hardcover.app/account/api. These haven’t been tested against the live services yet, so use the test buttons.</p>
        <label className="mt-3 block text-xs font-semibold text-muted" htmlFor="hc-token">Hardcover token (optional)</label>
        <div className="mt-1 flex gap-2">
          <input id="hc-token" className="field font-normal text-ink" type={showHc ? 'text' : 'password'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={s.hardcoverToken}
            onChange={(e) => upd({ hardcoverToken: e.target.value })} onBlur={(e) => { const c = cleanToken(e.target.value); if (c !== e.target.value) upd({ hardcoverToken: c }) }} />
          <button type="button" className="btn btn-ghost !min-h-11 !px-3 text-sm" onClick={() => setShowHc(!showHc)} aria-pressed={showHc}>{showHc ? 'Hide' : 'Show'}</button>
        </div>
        <p className="mt-1 text-xs text-muted">{cleanToken(s.hardcoverToken) ? `${cleanToken(s.hardcoverToken).length} characters saved. Spaces and line breaks from pasting are removed automatically.` : 'Nothing saved yet.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-ghost !min-h-10 text-sm" onClick={() => runTest('hc', () => testHardcover(s.hardcoverToken))}>Test Hardcover</button>
          <button className="btn btn-ghost !min-h-10 text-sm" onClick={() => runTest('inv', testInventaire)}>Test Inventaire</button>
        </div>
        <TestLine id="hc" /><TestLine id="inv" />
      </section>
      <section className="card p-5">
        <h3 className="text-lg font-bold">AI vision for screenshots (optional)</h3>
        <p className="mt-1 text-sm text-muted">Screenshots are normally read on your device for free. If you add your own Anthropic API key, you can choose to also send a batch of screenshots to Anthropic ({VISION_MODEL}) for harder images. The key stays in this browser and is only sent to Anthropic. This is experimental and costs a small amount per image on your account.</p>
        <label className="mt-3 block text-xs font-semibold text-muted">Anthropic API key
          <input className="field mt-1 font-normal text-ink" type="password" autoComplete="off" value={s.anthropicKey} onChange={(e) => upd({ anthropicKey: e.target.value })} /></label>
      </section>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Other</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={onTour}>Take the tour again</button>
          <button className="btn btn-ghost" onClick={async () => { await loadSampleBooks(); onChanged() }}>Add sample books (for trying things out)</button>
          <button className="btn btn-ghost !border-rust text-rust" onClick={() => setErasing(true)}>Erase library…</button>
        </div>
        <p className="mt-4 text-xs text-muted">Cover images and descriptions: Google Books and Open Library. Text recognition: Tesseract (runs on your device).</p>
      </section>
    </div>
  )
}
