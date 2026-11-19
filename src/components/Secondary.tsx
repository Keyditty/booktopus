import { useRef, useState } from 'react'
import { Cover } from './Cover'
import { download, eraseAll, exportCsv, exportJson, restoreJson } from '../lib/export'
import { getSettings, saveSettings, type ThemeName } from '../lib/settings'
import { undoBatch } from '../lib/store'
import { loadSampleBooks } from '../lib/sample'
import { VISION_MODEL } from '../lib/settings'
import type { BookView } from '../lib/shelves'
import type { ImportBatch } from '../types'

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

export function SettingsView({ bookCount, onChanged, onTheme, name, onName }: { bookCount: number; onChanged: () => void; onTheme: (t: ThemeName) => void; name: string; onName: (n: string) => void }) {
  const [s, setS] = useState(getSettings())
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const upd = (p: Partial<typeof s>) => { setS({ ...s, ...p }); saveSettings(p) }
  const stamp = new Date().toISOString().slice(0, 10)
  return (
    <div className="mx-auto max-w-2xl space-y-6 fade-in">
      <h2 className="text-2xl font-bold">Settings &amp; backup</h2>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Your name</h3>
        <label className="mt-2 block text-xs font-semibold text-muted" htmlFor="s-name">Shown in the greeting and header
          <input id="s-name" className="field mt-1 font-normal text-ink" defaultValue={name} onBlur={(e) => onName(e.target.value)} autoComplete="given-name" /></label>
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
          <button className="btn btn-primary" onClick={async () => download(`booktopus-backup-${stamp}.json`, await exportJson(), 'application/json')}>Download backup (JSON)</button>
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
        <h3 className="text-lg font-bold">AI vision for screenshots (optional)</h3>
        <p className="mt-1 text-sm text-muted">Screenshots are normally read on your device for free. If you add your own Anthropic API key, you can choose to also send a batch of screenshots to Anthropic ({VISION_MODEL}) for harder images. The key stays in this browser and is only sent to Anthropic. This is experimental and costs a small amount per image on your account.</p>
        <label className="mt-3 block text-xs font-semibold text-muted">Anthropic API key
          <input className="field mt-1 font-normal text-ink" type="password" autoComplete="off" value={s.anthropicKey} onChange={(e) => upd({ anthropicKey: e.target.value })} /></label>
      </section>
      <section className="card p-5">
        <h3 className="text-lg font-bold">Other</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={async () => { await loadSampleBooks(); onChanged() }}>Add sample books</button>
          <button className="btn btn-ghost !border-rust text-rust" onClick={async () => { if (confirm('Delete your entire library from this device? Download a backup first.')) await eraseAll() }}>Erase library…</button>
        </div>
        <p className="mt-4 text-xs text-muted">Cover images and descriptions: Google Books and Open Library. Text recognition: Tesseract (runs on your device).</p>
      </section>
    </div>
  )
}

export function Stats({ views, onOpen }: { views: BookView[]; onOpen: (id: string) => void }) {
  const [pick, setPick] = useState<BookView | null>(null)
  const finished = views.filter((v) => v.book.status === 'finished')
  const byYear = new Map<string, number>()
  finished.forEach((v) => { const y = v.book.finishedAt?.slice(0, 4) ?? 'Undated'; byYear.set(y, (byYear.get(y) ?? 0) + 1) })
  const years = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  const fmt = (f: string) => views.filter((v) => v.formats.includes(f as never)).length
  const authors = new Map<string, number>()
  finished.forEach((v) => v.book.authors.forEach((a) => authors.set(a, (authors.get(a) ?? 0) + 1)))
  const top = [...authors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const pool = views.filter((v) => v.book.wantToRead).length ? views.filter((v) => v.book.wantToRead) : views.filter((v) => v.book.status === 'unknown')
  const max = Math.max(1, ...years.map((y) => y[1]))
  return (
    <div className="mx-auto max-w-2xl space-y-5 fade-in">
      <h2 className="text-2xl font-bold">Your reading</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[[views.length, 'books'], [finished.length, 'finished'], [views.filter((v) => v.book.favorite).length, 'favorites']].map(([n, l]) => <div key={l as string} className="card p-4"><div className="serif text-3xl font-bold text-accent">{n}</div><div className="text-xs text-muted">{l}</div></div>)}
      </div>
      <section className="card p-5"><h3 className="font-bold">Finished by year</h3>
        {years.map(([y, n]) => <div key={y} className="mt-2 flex items-center gap-3 text-sm"><span className="w-14 text-muted">{y}</span><div className="h-4 rounded bg-accent" style={{ width: `${(n / max) * 70}%`, minWidth: 6 }} /><span>{n}</span></div>)}
        {!years.length && <p className="mt-1 text-sm text-muted">Mark books as finished to see this fill in.</p>}
      </section>
      <section className="card p-5"><h3 className="font-bold">Audiobooks vs ebooks</h3><p className="mt-1 text-sm text-muted">{fmt('audiobook')} audiobooks · {fmt('ebook')} ebooks · {fmt('comic')} comics</p>
        {top.length > 0 && <><h3 className="mt-4 font-bold">Favorite authors</h3><p className="mt-1 text-sm text-muted">{top.map(([a, n]) => `${a} (${n})`).join(' · ')}</p></>}</section>
      <section className="card p-5 text-center"><h3 className="font-bold">What should I read next?</h3>
        <button className="btn btn-primary mt-3" disabled={!pool.length} onClick={() => setPick(pool[Math.floor(Math.random() * pool.length)])}>Surprise me</button>
        {pick && <button className="mx-auto mt-4 block w-32 text-left" onClick={() => onOpen(pick.book.id)}><Cover title={pick.book.title} author={pick.book.authors[0]} url={pick.book.coverUrl} /><span className="serif mt-2 block text-center text-sm font-semibold">{pick.book.title}</span></button>}
      </section>
    </div>
  )
}
