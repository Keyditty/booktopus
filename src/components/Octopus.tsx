import { useMemo, useState } from 'react'
import { Cover } from './Cover'
import { Portal } from './Portal'
import { ARM_COUNT, armMode, assignArms } from '../lib/arms'
import { placeOnArm, removeFromArm, setStatus } from '../lib/store'
import type { BookView } from '../lib/shelves'
import type { Book } from '../types'

/* ---------- geometry: everything lives in one 400 x 640 drawing so it scales as a unit ---------- */
const W = 400, H = 640
const BW = 84, BH = 126, TOPY = 8
const BOTY = H - TOPY - BH
const COLS = [50, 150, 250, 350]

type Pt = [number, number]

/** Smooth curve through points (Catmull-Rom), returned as samples. */
function curve(pts: Pt[], per = 12): Pt[] {
  const p = [pts[0], ...pts, pts[pts.length - 1]]
  const out: Pt[] = []
  for (let i = 1; i < p.length - 2; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map((d) => 0.5 * ((2 * p[i][d]) + (-p[i - 1][d] + p[i + 1][d]) * t + (2 * p[i - 1][d] - 5 * p[i][d] + 4 * p[i + 1][d] - p[i + 2][d]) * t2 + (-p[i - 1][d] + 3 * p[i][d] - 3 * p[i + 1][d] + p[i + 2][d]) * t3)) as Pt)
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Control points for the arm that holds slot i. Top row arms rise from the head; bottom row mirrors them. */
function armPoints(i: number): Pt[] {
  const up = i < 4
  const tx = COLS[i % 4]
  const dx = tx - 200
  const dir = dx < 0 ? -1 : 1
  const wig = (i % 2 ? 1 : -1) * 18
  const pts: Pt[] = [
    [200 + dx * 0.12, 330], [200 + dx * 0.45, 275], [200 + dx * 0.9 + wig, 215],
    [tx - wig * 0.5, 172], [tx + dir * 6, 142],
  ]
  // spiral curl at the tip, wrapping the bottom corner of the book
  const cx = tx + dir * 20, cy = 126, sweep = -dir
  for (let k = 0; k <= 7; k++) {
    const t = k / 7, ang = Math.atan2(142 - cy, tx + dir * 6 - cx) + sweep * t * Math.PI * 1.3
    const r = 19 * (1 - t * 0.65)
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)])
  }
  return up ? pts : pts.map(([x, y]) => [x, H - y] as Pt)
}

function armShape(pts: Pt[]) {
  const s = curve(pts)
  const n = s.length
  const L: Pt[] = [], R: Pt[] = [], suck: { x: number; y: number; r: number }[] = []
  s.forEach((p, k) => {
    const a = s[Math.max(0, k - 1)], b = s[Math.min(n - 1, k + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len
    const t = k / (n - 1)
    const w = 2.5 + 30 * Math.pow(1 - t, 1.25)
    L.push([p[0] + (nx * w) / 2, p[1] + (ny * w) / 2]); R.push([p[0] - (nx * w) / 2, p[1] - (ny * w) / 2])
    if (k % 5 === 2 && t > 0.12 && t < 0.98 && w > 4) {
      const r = Math.max(1.2, w * 0.2)
      suck.push({ x: p[0] + nx * w * 0.2, y: p[1] + ny * w * 0.2, r }, { x: p[0] - nx * w * 0.2, y: p[1] - ny * w * 0.2, r })
    }
  })
  const f = (q: Pt) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`
  const d = `M${f(L[0])} ` + L.slice(1).map((q) => `L${f(q)}`).join(' ') + ' ' + R.reverse().map((q) => `L${f(q)}`).join(' ') + ' Z'
  return { d, suck }
}

const SPOTS = (() => {
  let seed = 11
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  return Array.from({ length: 34 }, () => ({ x: 125 + rnd() * 150, y: 180 + rnd() * 195, r: 3 + rnd() * 6.5, o: 0.55 + rnd() * 0.4 }))
})()

function Arm({ i }: { i: number }) {
  const { d, suck } = useMemo(() => armShape(armPoints(i)), [i])
  return (
    <g className="arm" style={{ animationDelay: `${i * -0.8}s` }}>
      <path d={d} fill="url(#skin)" stroke="#8a3a1f" strokeWidth={1.6} strokeLinejoin="round" />
      {suck.map((s, k) => <g key={k}><circle cx={s.x} cy={s.y} r={s.r} fill="#ffe9d2" stroke="#c4623c" strokeWidth={0.8} /><circle cx={s.x} cy={s.y} r={s.r * 0.42} fill="#e59a78" /></g>)}
    </g>
  )
}

function Eye({ cx, side }: { cx: number; side: -1 | 1 }) {
  const cy = 322
  return (
    <g>
      {/* raised eye socket */}
      <ellipse cx={cx} cy={cy} rx={30} ry={27} fill="url(#skin)" stroke="#8a3a1f" strokeWidth={1.6} />
      <ellipse cx={cx} cy={cy} rx={22} ry={20} fill="#7a2f17" />
      <g className="blink">
        <circle cx={cx} cy={cy} r={18} fill="url(#iris)" />
        <rect x={cx - 13} y={cy - 3.2} width={26} height={6.4} rx={3.2} fill="#140a05" />
        <circle cx={cx + 6} cy={cy - 8} r={4.2} fill="#fff" opacity={0.95} /><circle cx={cx - 8} cy={cy + 7} r={2} fill="#fff" opacity={0.65} />
      </g>
      {/* gentle brow ridge, lifted at the outer corner so the look is curious, not sleepy */}
      <path d={`M${cx - 26} ${cy - 10} Q ${cx} ${cy - 30} ${cx + 26} ${cy - 10} Q ${cx} ${cy - 22} ${cx - 26} ${cy - 10} Z`} fill="#c8602f" opacity={0.85} transform={`rotate(${side * -6} ${cx} ${cy})`} />
    </g>
  )
}

const BODY = 'M200 168 C258 168 280 224 272 266 C266 296 290 306 288 338 C286 366 252 386 200 386 C148 386 114 366 112 338 C110 306 134 296 128 266 C120 224 142 168 200 168 Z'

function Body() {
  return (
    <g>
      <clipPath id="bodyclip"><path d={BODY} /></clipPath>
      {/* webbing where the arms meet the head */}
      <ellipse cx={200} cy={372} rx={70} ry={26} fill="#c8602f" stroke="#8a3a1f" strokeWidth={1.4} />
      <path d={BODY} fill="url(#skin)" stroke="#8a3a1f" strokeWidth={1.8} />
      <g clipPath="url(#bodyclip)">
        {SPOTS.map((s, i) => <g key={i}><circle cx={s.x} cy={s.y} r={s.r} fill="#ffeed9" opacity={s.o} /><circle cx={s.x} cy={s.y} r={s.r * 0.45} fill="#e59a78" opacity={s.o * 0.8} /></g>)}
        <ellipse cx={184} cy={226} rx={24} ry={42} transform="rotate(-16 184 226)" fill="#fff" opacity={0.16} />
      </g>
      {/* siphon */}
      <path d="M236 372 q14 2 20 12 q-12 4 -22 -2 z" fill="#d9703a" stroke="#8a3a1f" strokeWidth={1.2} />
      <Eye cx={150} side={-1} /><Eye cx={250} side={1} />
      <path d="M184 366 Q200 378 216 366" fill="none" stroke="#6b2412" strokeWidth={3.2} strokeLinecap="round" />
    </g>
  )
}

/* ---------------------------------- the scene ---------------------------------- */

export function Octopus({ views, onOpen, allViews }: { views: BookView[]; onOpen: (id: string) => void; allViews: BookView[] }) {
  const [free, setFree] = useState<number | null>(null)
  const [held, setHeld] = useState<Book | null>(null)
  const arms = useMemo(() => assignArms(views.map((v) => v.book)), [views])
  const readingN = arms.filter((b) => b && armMode(b) === 'reading').length
  const queuedN = arms.filter((b) => b && armMode(b) === 'queued').length
  const slotBox = (i: number) => ({ left: `${((COLS[i % 4] - BW / 2) / W) * 100}%`, top: `${((i < 4 ? TOPY : BOTY) / H) * 100}%`, width: `${(BW / W) * 100}%`, height: `${(BH / H) * 100}%` })

  return (
    <section className="mx-auto mt-5 w-full max-w-[460px] fade-in" aria-label="The octopus's eight books">
      <div className="text-center">
        <h2 className="text-lg font-bold sm:text-xl">Eight arms, eight books</h2>
        <p className="serif text-sm text-muted">{readingN} reading now · {queuedN} up next · {ARM_COUNT - readingN - queuedN} free</p>
      </div>
      <div className="relative mx-auto mt-3 w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        {arms.map((b, i) => (
          <div key={i} className="absolute" style={{ ...slotBox(i), transform: `rotate(${i % 2 ? 2.2 : -2.2}deg)` }}>
            {b ? <HeldBook b={b} view={views.find((v) => v.book.id === b.id)!} onClick={() => setHeld(b)} /> : (
              <button onClick={() => setFree(i)} className="slot-empty flex h-full w-full flex-col items-center justify-center gap-1 text-[11px]" aria-label="Free arm. Pick a book">
                <span className="text-xl leading-none" aria-hidden>＋</span><span>Free arm</span>
              </button>
            )}
          </div>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" role="img" aria-label="A friendly octopus holding eight books with its arms">
          <defs>
            <linearGradient id="skin" x1="0.1" y1="0" x2="0.5" y2="1"><stop offset="0" stopColor="#f7b46a" /><stop offset="0.5" stopColor="#e47f45" /><stop offset="1" stopColor="#b9532b" /></linearGradient>
            <radialGradient id="iris" cx="45%" cy="40%" r="70%"><stop offset="0" stopColor="#fff0a8" /><stop offset="0.65" stopColor="#f6c23e" /><stop offset="1" stopColor="#d98a1c" /></radialGradient>
          </defs>
          {Array.from({ length: 8 }, (_, i) => <Arm key={i} i={i} />)}
          <Body />
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-accent" /> Reading now</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-gold" /> Up next</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-line" /> Free arm</span>
      </div>
      {free !== null && <Picker views={allViews} slot={free} onClose={() => setFree(null)} />}
      {held && <ArmSheet b={held} onOpen={() => { onOpen(held.id); setHeld(null) }} onClose={() => setHeld(null)} />}
    </section>
  )
}

function HeldBook({ b, view, onClick }: { b: Book; view: BookView; onClick: () => void }) {
  const reading = armMode(b) === 'reading'
  void view
  return (
    <button onClick={onClick} className="slot block h-full w-full text-left" title={b.title} aria-label={`${b.title}, ${reading ? 'reading now' : 'up next'}. Options`}
      style={reading ? { boxShadow: '0 0 0 3px var(--c-accent), 0 0 22px var(--glow)', borderRadius: 6 } : { outline: '2px dashed var(--c-gold)', outlineOffset: 2, borderRadius: 6 }}>
      <Cover title={b.title} author={b.authors[0]} url={b.coverUrl} className={reading ? '' : 'saturate-[.8]'} />
      <span className={`absolute left-0 top-1.5 rounded-r-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${reading ? 'bg-accent text-onaccent' : 'bg-gold text-[#2b1d12]'}`}>{reading ? 'Reading' : 'Up next'}</span>
    </button>
  )
}

function Sheet({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 fade-in sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-in card max-h-[82vh] w-full max-w-md overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl" style={{ background: 'var(--c-sea)' }} onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
    </Portal>
  )
}

function ArmSheet({ b, onOpen, onClose }: { b: Book; onOpen: () => void; onClose: () => void }) {
  const reading = armMode(b) === 'reading'
  const act = (fn: () => Promise<unknown>) => async () => { await fn(); onClose() }
  return (
    <Sheet onClose={onClose} label={b.title}>
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0"><Cover title={b.title} author={b.authors[0]} url={b.coverUrl} /></span>
        <div className="min-w-0"><div className="serif truncate text-lg font-bold">{b.title}</div><div className="truncate text-sm text-muted">{b.authors[0]}</div>
          <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${reading ? 'bg-accent text-onaccent' : 'bg-gold text-[#2b1d12]'}`}>{reading ? 'Reading now' : 'Up next'}</div></div>
      </div>
      <div className="mt-4 grid gap-2">
        {reading
          ? <button className="btn btn-ghost" onClick={act(() => placeOnArm(b.id, 'queued'))}>↩ Move back to Up next</button>
          : <button className="btn btn-primary" onClick={act(() => placeOnArm(b.id, 'reading'))}>📖 Start reading</button>}
        <button className="btn btn-ghost" onClick={act(() => setStatus(b.id, 'finished'))}>✅ I finished it</button>
        <button className="btn btn-ghost" onClick={onOpen}>See details</button>
        <button className="btn btn-ghost !border-rust text-rust" onClick={act(() => removeFromArm(b.id))}>Free this arm</button>
      </div>
    </Sheet>
  )
}

function Picker({ views, slot, onClose }: { views: BookView[]; slot: number; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'reading' | 'queued'>('queued')
  const list = useMemo(() => {
    const rank = (v: BookView) => (v.book.wantToRead ? 0 : v.book.status === 'unknown' || v.book.status === 'not_started' ? 1 : 2)
    const onArm = new Set(assignArms(views.map((v) => v.book)).filter(Boolean).map((b) => b!.id))
    return views.filter((v) => !onArm.has(v.book.id) && v.book.status !== 'finished' && v.book.status !== 'dnf' && (!q || (v.book.title + ' ' + v.book.authors.join(' ')).toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => rank(a) - rank(b) || a.book.title.localeCompare(b.book.title)).slice(0, 40)
  }, [views, q])
  return (
    <Sheet onClose={onClose} label="Choose a book for this arm">
      <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Give this arm a book</h3><button className="text-sm text-accent underline" onClick={onClose}>Close</button></div>
      <div className="mt-3 flex gap-2" role="radiogroup" aria-label="How will you read it">
        <button role="radio" aria-checked={mode === 'queued'} className={`btn flex-1 !min-h-10 text-sm ${mode === 'queued' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('queued')}>Up next</button>
        <button role="radio" aria-checked={mode === 'reading'} className={`btn flex-1 !min-h-10 text-sm ${mode === 'reading' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('reading')}>Reading now</button>
      </div>
      <input className="field mt-3" placeholder="Search your shelf" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 space-y-1">
        {list.map((v) => (
          <li key={v.book.id}>
            <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-mist" onClick={async () => { await placeOnArm(v.book.id, mode, slot); onClose() }}>
              <span className="w-9 shrink-0"><Cover title={v.book.title} author={v.book.authors[0]} url={v.book.coverUrl} /></span>
              <span className="min-w-0"><span className="serif block truncate font-semibold">{v.book.title}</span><span className="block truncate text-xs text-muted">{v.book.authors[0]}{v.book.wantToRead ? ' · want to read' : ''}</span></span>
            </button>
          </li>
        ))}
        {!list.length && <li className="p-4 text-center text-sm text-muted">No other books on your shelf yet.</li>}
      </ul>
    </Sheet>
  )
}
