import { useMemo, useState } from 'react'
import { Cover } from './Cover'
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
  const wig = (i % 2 ? 1 : -1) * 16
  const pts: Pt[] = [
    [200 + dx * 0.15, 322], [200 + dx * 0.48, 268], [200 + dx * 0.92 + wig, 210],
    [tx - wig * 0.4, 168], [tx + dir * 14, 138], [tx + dir * 28, 122], [tx + dir * 22, 108],
  ]
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
    const w = 3 + 25 * Math.pow(1 - t, 1.15)
    L.push([p[0] + (nx * w) / 2, p[1] + (ny * w) / 2]); R.push([p[0] - (nx * w) / 2, p[1] - (ny * w) / 2])
    if (k % 5 === 2 && t > 0.14 && t < 0.97 && w > 4.5) suck.push({ x: p[0] + nx * w * 0.12, y: p[1] + ny * w * 0.12, r: Math.max(1.3, w * 0.24) })
  })
  const f = (q: Pt) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`
  const d = `M${f(L[0])} ` + L.slice(1).map((q) => `L${f(q)}`).join(' ') + ' ' + R.reverse().map((q) => `L${f(q)}`).join(' ') + ' Z'
  return { d, suck }
}

const SPOTS = (() => {
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  return Array.from({ length: 26 }, () => ({ x: 140 + rnd() * 120, y: 205 + rnd() * 160, r: 2 + rnd() * 5, o: 0.18 + rnd() * 0.3, light: rnd() > 0.55 }))
})()

function Arm({ i }: { i: number }) {
  const { d, suck } = useMemo(() => armShape(armPoints(i)), [i])
  return (
    <g className="arm" style={{ animationDelay: `${i * -0.8}s` }}>
      <path d={d} fill="url(#skin)" stroke="#4a2284" strokeWidth={1.6} strokeLinejoin="round" />
      {suck.map((s, k) => <g key={k}><circle cx={s.x} cy={s.y} r={s.r} fill="#ffd9ea" stroke="#c77aa6" strokeWidth={0.7} /><circle cx={s.x} cy={s.y} r={s.r * 0.45} fill="#e9a3c6" /></g>)}
    </g>
  )
}

function Eye({ cx }: { cx: number }) {
  const cy = 326
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={25} ry={23} fill="#4a2284" />
      <g className="blink">
        <circle cx={cx} cy={cy} r={19} fill="url(#iris)" />
        <rect x={cx - 12} y={cy - 3.5} width={24} height={7} rx={3.5} fill="#170c2b" />
        <circle cx={cx - 14} cy={cy - 12} r={0} />
        <circle cx={cx + 6} cy={cy - 7} r={4} fill="#fff" opacity={0.95} /><circle cx={cx - 7} cy={cy + 7} r={2} fill="#fff" opacity={0.7} />
      </g>
      {/* relaxed upper lid gives the friendly, sleepy-kind look */}
      <path d={`M${cx - 25} ${cy - 6} C ${cx - 20} ${cy - 34}, ${cx + 20} ${cy - 34}, ${cx + 25} ${cy - 6} C ${cx + 12} ${cy - 20}, ${cx - 12} ${cy - 20}, ${cx - 25} ${cy - 6} Z`} fill="url(#skin)" stroke="#4a2284" strokeWidth={1.4} />
    </g>
  )
}

function Body() {
  return (
    <g>
      <clipPath id="bodyclip"><ellipse cx={206} cy={272} rx={57} ry={76} transform="rotate(8 206 272)" /><ellipse cx={200} cy={325} rx={72} ry={52} /></clipPath>
      <ellipse cx={206} cy={272} rx={57} ry={76} transform="rotate(8 206 272)" fill="url(#skin)" stroke="#4a2284" strokeWidth={1.8} />
      <ellipse cx={200} cy={325} rx={72} ry={52} fill="url(#skin)" stroke="#4a2284" strokeWidth={1.8} />
      {/* blend the seam between mantle and head */}
      <ellipse cx={203} cy={298} rx={58} ry={24} fill="url(#skin)" />
      <g clipPath="url(#bodyclip)">
        {SPOTS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.light ? '#e7c8ff' : '#4a2284'} opacity={s.o} />)}
        <ellipse cx={186} cy={238} rx={20} ry={36} transform="rotate(-18 186 238)" fill="#fff" opacity={0.2} />
      </g>
      <Eye cx={168} /><Eye cx={232} />
      <ellipse cx={146} cy={356} rx={13} ry={7} fill="#ff8fb8" opacity={0.4} /><ellipse cx={254} cy={356} rx={13} ry={7} fill="#ff8fb8" opacity={0.4} />
      <path d="M185 362 Q200 376 215 362" fill="none" stroke="#3a1670" strokeWidth={3.2} strokeLinecap="round" />
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
            <linearGradient id="skin" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#c58af0" /><stop offset="0.55" stopColor="#9a55d6" /><stop offset="1" stopColor="#6c33b3" /></linearGradient>
            <radialGradient id="iris" cx="45%" cy="40%" r="70%"><stop offset="0" stopColor="#ffe08a" /><stop offset="0.7" stopColor="#f0a53a" /><stop offset="1" stopColor="#c9701c" /></radialGradient>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 fade-in sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className="sheet-in card max-h-[82vh] w-full max-w-md overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl" style={{ background: 'var(--c-sea)' }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
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
