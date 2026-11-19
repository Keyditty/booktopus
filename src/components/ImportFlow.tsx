import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Review } from './Review'
import { ManualAdd } from './ManualAdd'
import { parseBookText } from '../lib/importers/text'
import { parseLibby } from '../lib/importers/libby'
import { parseListing } from '../lib/importers/listing'
import { ocrLinesToCandidates } from '../lib/importers/screenshot'
import { getSettings } from '../lib/settings'
import type { Book, Candidate, SourceName } from '../types'

export type ImportKind = 'hub' | 'manual' | 'paste' | 'screenshots' | 'libby' | 'audible' | 'hoopla'

const CARDS: { kind: Exclude<ImportKind, 'hub'>; icon: string; title: string; text: string; tag: string }[] = [
  { kind: 'manual', icon: '✍️', title: 'Add one book by hand', text: 'Type a few words and pick the book — we fill in the cover.', tag: 'Quickest for one' },
  { kind: 'paste', icon: '📝', title: 'Paste a book list', text: 'Bring over your ChatGPT lists, notes, or a CSV / text / JSON file.', tag: 'Works great' },
  { kind: 'screenshots', icon: '📸', title: 'Upload screenshots', text: 'Screenshot your library in Audible, Libby or Hoopla and drop them here.', tag: 'Works with any app' },
  { kind: 'libby', icon: '📗', title: 'Import Libby history', text: 'Use the timeline you export from Libby.', tag: 'Repeatable' },
  { kind: 'audible', icon: '🎧', title: 'Import Audible books', text: 'Copy your library page text, or use screenshots.', tag: 'Copy & paste' },
  { kind: 'hoopla', icon: '📚', title: 'Import Hoopla books', text: 'Copy your Hoopla history, or use screenshots.', tag: 'Copy & paste' },
]

export function ImportFlow({ kind, setKind, books, onDone, prefill }: { kind: ImportKind; setKind: (k: ImportKind) => void; books: Book[]; onDone: () => void; prefill?: string }) {
  const [run, setRun] = useState<{ cands: Candidate[]; adapter: string; label: string; notes: string[] } | null>(null)
  const start = useCallback((cands: Candidate[], adapter: string, label: string, notes: string[] = []) => setRun({ cands, adapter, label, notes }), [])

  if (run) return <Review candidates={run.cands} books={books} adapter={run.adapter} label={run.label} notes={run.notes} onDone={onDone} onCancel={() => setRun(null)} />
  if (kind === 'hub') return (
    <div className="mx-auto max-w-3xl fade-in">
      <h2 className="text-2xl font-bold">Add books to your shelf</h2>
      <p className="mt-1 text-muted">Pick whichever is easiest. You’ll get a chance to check everything before it’s added.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <button key={c.kind} onClick={() => setKind(c.kind)} className="card flex items-start gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-3xl" aria-hidden>{c.icon}</span>
            <span><span className="serif block text-lg font-bold">{c.title}</span><span className="block text-sm text-muted">{c.text}</span><span className="mt-2 inline-block rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-accent">{c.tag}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
  if (kind === 'manual') return <div><button className="mb-3 text-sm text-accent underline" onClick={() => setKind('hub')}>← All ways to add books</button><ManualAdd books={books} prefill={prefill} onDone={onDone} /></div>
  if (kind === 'screenshots') return <Screenshots onResult={start} onBack={() => setKind('hub')} initialSource="audible" />
  return <TextImport kind={kind} onResult={start} onBack={() => setKind('hub')} switchTo={setKind} />
}

// ---------------- text / file imports ----------------
const TEXT_CFG: Record<'paste' | 'libby' | 'audible' | 'hoopla', { title: string; source: SourceName; steps: ReactNode[]; placeholder: string; note?: string }> = {
  paste: {
    title: 'Paste a book list', source: 'chatgpt', placeholder: 'Paste your ChatGPT conversation or list here…',
    steps: ['Open your ChatGPT conversation, select the list (or the whole chat) and copy it.', 'Paste it below — or choose a .txt, .md, .csv or .json file.', 'Chatter and explanations are ignored; only book titles are picked out.'],
  },
  libby: {
    title: 'Import Libby history', source: 'libby', placeholder: 'Paste the table you copied from your Libby timeline, or choose the exported file…',
    steps: ['In Libby, open Shelf → Timeline.', 'Tap Actions → Export timeline, then download the spreadsheet (CSV) — or open the table link and copy the table.', 'Choose the file below or paste the table. Importing again later only adds what’s new.'],
    note: 'Borrowed and returned dates are saved, but a returned loan is never marked “Finished” automatically — you decide that.',
  },
  audible: {
    title: 'Import Audible books', source: 'audible', placeholder: 'Paste the text from your Audible library page…',
    steps: ['Audible doesn’t offer a library export, and we never ask for your Amazon password.', 'On a computer, sign in to audible.com → Library, choose “All titles”, press Ctrl/⌘+A then Ctrl/⌘+C, and paste below.', 'Already used a tool that exports Audible to CSV/JSON? Choose that file instead.', 'No computer? Use screenshots — it works from your phone.'],
  },
  hoopla: {
    title: 'Import Hoopla books', source: 'hoopla', placeholder: 'Paste the text from your Hoopla History page…',
    steps: ['Hoopla has no export button, so we read what you copy.', 'Open hoopladigital.com → your account → History, press Ctrl/⌘+A then Ctrl/⌘+C, and paste below.', 'Only audiobooks, ebooks and comics are kept; movies, music and TV are skipped.', 'On a phone? Use screenshots instead.'],
    note: 'Borrowed titles are not marked “Finished”.',
  },
}

function TextImport({ kind, onResult, onBack, switchTo }: { kind: 'paste' | 'libby' | 'audible' | 'hoopla'; onResult: (c: Candidate[], adapter: string, label: string, notes?: string[]) => void; onBack: () => void; switchTo: (k: ImportKind) => void }) {
  const cfg = TEXT_CFG[kind]
  const [text, setText] = useState('')
  const [names, setNames] = useState<string[]>([])
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    const parts: string[] = []
    for (const f of Array.from(files)) parts.push(await f.text())
    setNames(Array.from(files).map((f) => f.name)); setText(parts.join('\n\n'))
  }

  function go() {
    setErr('')
    try {
      const fn = names.join(', ') || undefined
      let cands: Candidate[] = [], notes: string[] = []
      if (kind === 'libby') { const r = parseLibby(text, fn); cands = r.candidates; if (r.skipped) notes.push(`${r.skipped} non-book rows (like magazines) were skipped.`) }
      else if (kind === 'paste') { const r = parseBookText(text, { source: 'chatgpt', filename: fn }); cands = r.candidates; if (r.ignoredLines) notes.push(`${r.ignoredLines} lines that didn’t look like books were ignored.`) }
      else { const r = parseListing(text, kind, { filename: fn }); cands = r.candidates; if (r.skippedMedia) notes.push(`${r.skippedMedia} movies/music/TV items were skipped.`) }
      if (!cands.length) { setErr('We couldn’t find any books in that. Try copying more of the page, or use screenshots instead.'); return }
      onResult(cands, kind === 'paste' ? 'text' : kind, `${cfg.title}${fn ? ` — ${fn}` : ''}`, notes)
    } catch (e) { setErr(`That file couldn’t be read (${(e as Error).message}).`) }
  }

  return (
    <div className="mx-auto max-w-2xl fade-in">
      <button className="text-sm text-accent underline" onClick={onBack}>← All ways to add books</button>
      <h2 className="mt-2 text-2xl font-bold">{cfg.title}</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">{cfg.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {cfg.note && <p className="mt-3 rounded-xl bg-mist/70 p-3 text-sm">{cfg.note}</p>}
      <textarea className="field mt-4 min-h-56 font-mono text-sm" value={text} placeholder={cfg.placeholder} onChange={(e) => { setText(e.target.value); setNames([]) }} aria-label="Book text" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" hidden multiple accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,text/*,application/json" onChange={(e) => onFiles(e.target.files)} />
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Choose a file…</button>
        {names.length > 0 && <span className="text-sm text-muted">{names.join(', ')}</span>}
        <button className="btn btn-primary ml-auto" disabled={!text.trim()} onClick={go}>Find my books</button>
      </div>
      {err && <p role="alert" className="mt-3 text-sm text-rust">{err}</p>}
      {(kind === 'audible' || kind === 'hoopla') && <p className="mt-6 text-sm">Prefer screenshots? <button className="text-accent underline" onClick={() => switchTo('screenshots')}>Upload screenshots</button></p>}
    </div>
  )
}

// ---------------- screenshots ----------------
function Screenshots({ onResult, onBack, initialSource }: { onResult: (c: Candidate[], adapter: string, label: string, notes?: string[]) => void; onBack: () => void; initialSource: SourceName }) {
  const [files, setFiles] = useState<File[]>([])
  const [source, setSource] = useState<SourceName>(initialSource)
  const [busy, setBusy] = useState<{ i: number; n: number; stage: string } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [useVision, setUseVision] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasKey = !!getSettings().anthropicKey
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])

  const add = (fl: FileList | File[] | null) => {
    if (!fl) return
    const imgs = Array.from(fl).filter((f) => f.type.startsWith('image/'))
    setFiles((cur) => [...cur, ...imgs])
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }

  async function go() {
    setErrors([]); const errs: string[] = []
    const all: Candidate[] = []
    try {
      const { ocrImage } = await import('../lib/ocr')
      for (let i = 0; i < files.length; i++) {
        setBusy({ i: i + 1, n: files.length, stage: 'Reading' })
        try {
          const lines = await ocrImage(files[i])
          all.push(...ocrLinesToCandidates(lines, source, `Screenshot ${i + 1} (${files[i].name || 'image'}) · on-device text recognition`))
        } catch (e) { errs.push(`Screenshot ${i + 1}: ${(e as Error).message}`) }
      }
      if (useVision && hasKey) {
        const { visionExtract } = await import('../lib/vision')
        for (let i = 0; i < files.length; i += 4) {
          setBusy({ i: Math.min(i + 4, files.length), n: files.length, stage: 'Asking AI vision about' })
          try { all.push(...(await visionExtract(files.slice(i, i + 4), getSettings().anthropicKey, source))) } catch (e) { errs.push(`AI vision: ${(e as Error).message}`) }
        }
      }
    } catch (e) { errs.push(`Text recognition couldn’t start: ${(e as Error).message}`) }
    setBusy(null); setErrors(errs)
    if (all.length) onResult(all, 'screenshots', `${files.length} screenshot${files.length === 1 ? '' : 's'} (${source})`, errs)
    else if (!errs.length) setErrors(['No books were recognised. Try a clearer screenshot where titles are visible.'])
  }

  return (
    <div className="mx-auto max-w-2xl fade-in">
      <button className="text-sm text-accent underline" onClick={onBack}>← All ways to add books</button>
      <h2 className="mt-2 text-2xl font-bold">Upload screenshots</h2>
      <p className="mt-1 text-sm text-muted">Open Audible, Libby or Hoopla, screenshot your library (scroll and take several), and add them all here. Your screenshots are read on this device and are not saved or uploaded.</p>
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
        className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-accent bg-mist' : 'border-line bg-surface'}`}>
        <div className="text-4xl" aria-hidden>🖼️</div>
        <p className="mt-2 font-semibold">Drag screenshots here</p>
        <input ref={inputRef} type="file" hidden multiple accept="image/*" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <button className="btn btn-primary mt-3" onClick={() => inputRef.current?.click()}>Choose from photos / files</button>
      </div>
      {files.length > 0 && (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {previews.map((p, i) => <div key={p} className="relative shrink-0"><img src={p} alt={`Screenshot ${i + 1}`} className="h-24 w-16 rounded-lg border border-mist object-cover" /><button aria-label={`Remove screenshot ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-black/70 text-xs text-white">✕</button></div>)}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="text-xs font-semibold text-muted">These are from
              <select className="field mt-1 font-normal text-ink" value={source} onChange={(e) => setSource(e.target.value as SourceName)}>
                <option value="audible">Audible</option><option value="libby">Libby</option><option value="hoopla">Hoopla</option><option value="screenshot">Something else</option>
              </select>
            </label>
            <button className="btn btn-primary ml-auto" disabled={!!busy} onClick={go}>{busy ? `${busy.stage} ${busy.i} of ${busy.n}…` : `Find books in ${files.length} screenshot${files.length === 1 ? '' : 's'}`}</button>
          </div>
          <div className="card mt-4 p-3 text-sm">
            <label className={`flex items-start gap-2 ${hasKey ? '' : 'opacity-60'}`}>
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-accent)]" disabled={!hasKey} checked={useVision} onChange={(e) => setUseVision(e.target.checked)} />
              <span><strong>Also use AI vision (optional)</strong><br /><span className="text-muted">Helps with covers that have little text. This sends these screenshots to Anthropic using your own key. {hasKey ? 'Leave unchecked to keep everything on this device.' : 'Add a key in Settings to enable.'}</span></span>
            </label>
          </div>
        </>
      )}
      {busy && <div className="mt-4 h-2 overflow-hidden rounded-full bg-mist"><div className="h-full bg-accent transition-all" style={{ width: `${(busy.i / busy.n) * 100}%` }} /></div>}
      {errors.map((e, i) => <p key={i} role="alert" className="mt-2 text-sm text-rust">{e}</p>)}
    </div>
  )
}
