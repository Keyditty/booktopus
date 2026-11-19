import { useMemo, useState } from 'react'
import { Cover } from './Cover'
import { setStatus } from '../lib/store'
import type { BookView } from '../lib/shelves'

const TOP_X = [50, 150, 250, 350] // arm targets in the 400-wide band, matching the 4 columns

function arm(tx: number, up: boolean) {
  const H = 140, hy = up ? 72 : 68
  const y = (v: number) => (up ? v : H - v)
  const sway = (tx - 200) * 0.35
  return `M200 ${hy} C ${200 + sway * 0.2} ${y(46)}, ${tx - sway * 0.6} ${y(86)}, ${tx} ${y(0)}`
}

function Arm({ tx, up, i }: { tx: number; up: boolean; i: number }) {
  const d = arm(tx, up)
  const props = { fill: 'none', strokeLinecap: 'round' as const, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <g className="arm" style={{ animationDelay: `${i * -0.7}s` }}>
      <path d={d} stroke="#4b2a8f" strokeWidth={15} {...props} />
      <path d={d} stroke="#7b52d6" strokeWidth={10} {...props} />
      <path d={d} stroke="#ffd9f0" strokeWidth={3.5} strokeDasharray="0 11" {...props} />
    </g>
  )
}

function Head() {
  return (
    <svg viewBox="0 0 120 112" className="h-[104px] w-[112px] drop-shadow-[0_6px_14px_rgba(0,0,0,.45)] sm:h-[124px] sm:w-[134px]" role="img" aria-label="A friendly octopus wearing reading glasses">
      <defs>
        <radialGradient id="mantle" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#a47df2" /><stop offset="0.6" stopColor="#7b52d6" /><stop offset="1" stopColor="#4b2a8f" /></radialGradient>
      </defs>
      <path d="M12 72 C4 28 38 2 60 2 C82 2 116 28 108 72 C105 92 90 100 60 100 C30 100 15 92 12 72 Z" fill="url(#mantle)" />
      <circle cx="30" cy="30" r="4" fill="#c7aaff" opacity=".6" /><circle cx="84" cy="22" r="3" fill="#c7aaff" opacity=".6" /><circle cx="94" cy="40" r="2.5" fill="#c7aaff" opacity=".6" />
      <ellipse cx="30" cy="76" rx="8" ry="5" fill="#ff8fb8" opacity=".55" /><ellipse cx="90" cy="76" rx="8" ry="5" fill="#ff8fb8" opacity=".55" />
      <g className="blink"><circle cx="42" cy="62" r="12" fill="#fff" /><circle cx="78" cy="62" r="12" fill="#fff" />
        <circle cx="43" cy="66" r="6" fill="#1c1240" /><circle cx="77" cy="66" r="6" fill="#1c1240" />
        <circle cx="45" cy="63" r="2" fill="#fff" /><circle cx="79" cy="63" r="2" fill="#fff" /></g>
      <circle cx="42" cy="62" r="16" fill="none" stroke="#f6c667" strokeWidth="2.6" /><circle cx="78" cy="62" r="16" fill="none" stroke="#f6c667" strokeWidth="2.6" />
      <path d="M57 60 Q60 56 63 60" fill="none" stroke="#f6c667" strokeWidth="2.6" />
      <path d="M52 86 Q60 92 68 86" fill="none" stroke="#2a1458" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

function Slot({ v, onOpen, onEmpty }: { v?: BookView; onOpen: (id: string) => void; onEmpty: () => void }) {
  if (!v) return (
    <button onClick={onEmpty} className="slot-empty flex aspect-[2/3] w-full flex-col items-center justify-center gap-1 text-xs" aria-label="Free arm. Pick a book to read">
      <span className="text-2xl leading-none" aria-hidden>＋</span><span>Free arm</span>
    </button>
  )
  const b = v.book
  return (
    <button onClick={() => onOpen(b.id)} className="slot block w-full text-left" title={b.title} aria-label={`${b.title}, reading now. Open details`}>
      <Cover title={b.title} author={b.authors[0]} url={b.coverUrl} />
    </button>
  )
}

export function Octopus({ views, onOpen, allViews }: { views: BookView[]; onOpen: (id: string) => void; allViews: BookView[] }) {
  const [picking, setPicking] = useState(false)
  const reading = useMemo(() => views.filter((v) => v.book.status === 'in_progress').sort((a, b) => (b.book.startedAt ?? b.book.updatedAt).localeCompare(a.book.startedAt ?? a.book.updatedAt)), [views])
  const arms = Array.from({ length: 8 }, (_, i) => reading[i])
  const extra = Math.max(0, reading.length - 8)
  const slots = (from: number) => (
    <div className="grid grid-cols-4 gap-3 sm:gap-7">{arms.slice(from, from + 4).map((v, i) => <Slot key={from + i} v={v} onOpen={onOpen} onEmpty={() => setPicking(true)} />)}</div>
  )
  return (
    <section className="card fade-in mx-auto mt-6 max-w-xl px-4 pb-5 pt-4 sm:px-8" aria-label="What the octopus is reading">
      <div className="text-center">
        <h2 className="text-lg font-bold sm:text-xl">Eight arms, eight books</h2>
        <p className="serif text-sm text-muted">{reading.length === 0 ? 'Your octopus is waiting for a story. Tap a free arm to start one.' : `Reading ${Math.min(reading.length, 8)} of 8 right now${extra ? ` (+${extra} more on the Reading shelf)` : ''}`}</p>
      </div>
      <div className="mt-4">{slots(0)}</div>
      <div className="relative -my-1 h-[130px] sm:h-[150px]">
        <svg viewBox="0 0 400 140" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {TOP_X.map((x, i) => <Arm key={'u' + x} tx={x} up i={i} />)}
          {TOP_X.map((x, i) => <Arm key={'d' + x} tx={x} up={false} i={i + 4} />)}
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><Head /></div>
      </div>
      {slots(4)}
      {picking && <Picker views={allViews} onClose={() => setPicking(false)} />}
    </section>
  )
}

function Picker({ views, onClose }: { views: BookView[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const rank = (v: BookView) => (v.book.wantToRead ? 0 : v.book.status === 'unknown' || v.book.status === 'not_started' ? 1 : 2)
    return views.filter((v) => v.book.status !== 'in_progress' && (!q || (v.book.title + ' ' + v.book.authors.join(' ')).toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => rank(a) - rank(b) || a.book.title.localeCompare(b.book.title)).slice(0, 40)
  }, [views, q])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 fade-in sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose a book to read">
      <div className="sheet-in card max-h-[80vh] w-full max-w-md overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl" style={{ background: 'var(--c-sea)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Which book next?</h3><button className="text-sm text-accent underline" onClick={onClose}>Close</button></div>
        <input className="field mt-3" placeholder="Search your shelf" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul className="mt-3 space-y-1">
          {list.map((v) => (
            <li key={v.book.id}>
              <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-mist" onClick={async () => { await setStatus(v.book.id, 'in_progress'); onClose() }}>
                <span className="w-9 shrink-0"><Cover title={v.book.title} author={v.book.authors[0]} url={v.book.coverUrl} /></span>
                <span className="min-w-0"><span className="serif block truncate font-semibold">{v.book.title}</span><span className="block truncate text-xs text-muted">{v.book.authors[0]}{v.book.wantToRead ? ' · want to read' : ''}</span></span>
              </button>
            </li>
          ))}
          {!list.length && <li className="p-4 text-center text-sm text-muted">No other books on your shelf yet.</li>}
        </ul>
      </div>
    </div>
  )
}
