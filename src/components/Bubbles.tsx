import { useMemo } from 'react'

/** Decorative rising bubbles and light rays. Purely visual, hidden from assistive tech and for reduced-motion users. */
export function SeaFx() {
  const bubbles = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const size = 6 + ((i * 37) % 22)
    return { size, left: (i * 61) % 100, dur: 14 + ((i * 7) % 16), delay: -((i * 5) % 20), drift: ((i % 2 ? 1 : -1) * (10 + ((i * 13) % 30))) }
  }), [])
  return (
    <div className="sea-fx" aria-hidden>
      <div className="rays" />
      {bubbles.map((b, i) => <span key={i} className="bubble" style={{ width: b.size, height: b.size, left: `${b.left}%`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`, ['--drift' as string]: `${b.drift}px` }} />)}
    </div>
  )
}
