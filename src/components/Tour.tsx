import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Step { id: string; emoji: string; title: string; body: string[]; target?: string; name?: boolean }

const STEPS: Step[] = [
  { id: 'welcome', emoji: '🐙', title: 'Welcome to Booktopus', body: ['Your personal underwater library: every book from Audible, Libby, Hoopla and your own lists, in one place.', 'This 1-minute tour shows you where everything is. You can replay it any time from the ⋯ menu.'], name: true },
  { id: 'add', emoji: '＋', title: 'Add books here', target: 'add', body: ['Tap Add to bring your books in without typing them one by one:', '• Paste a list, like your ChatGPT list\n• Upload screenshots from Audible, Libby or Hoopla\n• Import a Libby file, Excel or CSV\n• Add a single book by hand'] },
  { id: 'search', emoji: '🔍', title: 'Two kinds of search', target: 'search', body: ['📚 My library finds books you already have.', '🌐 Find any book looks up every book out there by title, author or ISBN. Then you can add it, see its whole series, or search the web.'] },
  { id: 'tabs', emoji: '🧭', title: 'Home, Library, Series and Reef', target: 'tabs', body: ['🐙 Home: your octopus and shelves of what’s new.\n📚 Library: every cover, with filters for genre, format, spice and more.\n🔗 Series: how far along you are in each series and what to read next.\n🏆 Reef: points, levels, badges, goals and charts.'] },
  { id: 'octopus', emoji: '🐙', title: 'Meet your octopus', body: ['Eight arms hold eight books. A teal outline means Reading now. A gold dashed outline means Up next, your queue so you never forget what you meant to read.', 'Tap a free arm to give it a book. Tap a held book to start it, finish it, or free the arm.'] },
  { id: 'book', emoji: '📖', title: 'Every book has its own page', body: ['Tap any cover to mark it Reading, Finished or Didn’t finish, give it stars and a 🌶 spice level, and add genres (type your own, like Romantasy).', 'You can also see where you have it (Audible, Libby, Hoopla), write notes, and find the whole series.'] },
  { id: 'levels', emoji: '🏆', title: 'Points, levels and badges', body: ['Every finished book earns points. Levels come from books finished, climbing from 🦠 Plankton up to the 🦑 Kraken at 1,000 books: 10, 25, 50, 100, 250, 500, then 1,000.', 'Set yearly and monthly goals in Settings and keep your streak going.'] },
  { id: 'menu', emoji: '⚙️', title: 'Settings and backup', target: 'menu', body: ['Open the ⋯ menu for Settings: download a backup, switch colors, set your name and goals, and connect optional extras.', 'Your library lives only on this device, so download a backup now and then.'] },
  { id: 'done', emoji: '🎉', title: 'You’re all set', body: ['Ready to fill your shelf? Add your first books, or just look around.'] },
]

/** First-run walkthrough. Highlights the real buttons when they are on screen; otherwise shows a centered card. */
export function Tour({ name, setName, onNavigate, onFinish }: { name: string; setName: (n: string) => void; onNavigate: () => void; onFinish: (goAdd: boolean) => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  useEffect(() => { if (step.target) onNavigate() }, [step.target, onNavigate])
  useEffect(() => { nextRef.current?.focus() }, [i])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFinish(false); if (e.key === 'ArrowRight' && !last) setI((n) => n + 1); if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [last, onFinish])

  useLayoutEffect(() => {
    if (!step.target) { setRect(null); return }
    const measure = () => { const el = document.querySelector(`[data-tour="${step.target}"]`); setRect(el ? el.getBoundingClientRect() : null) }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    measure()
    const t = setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { clearInterval(t); window.removeEventListener('resize', measure) }
  }, [step.target, i])

  const pad = 8
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Tour, step ${i + 1} of ${STEPS.length}: ${step.title}`}>
      {rect ? (
        <div className="pointer-events-none fixed rounded-2xl border-2 border-gold transition-all duration-300" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(3,10,22,.82), 0 0 24px var(--glow)' }} />
      ) : <div className="fixed inset-0 bg-[rgba(3,10,22,.82)]" />}
      <div className={`fixed inset-x-0 flex justify-center px-4 ${rect ? 'bottom-6' : 'top-1/2 -translate-y-1/2'}`} style={rect ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}>
        <div className="card sheet-in w-full max-w-md p-5" style={{ background: 'var(--c-sea)', borderColor: 'var(--c-gold)' }}>
          <div className="flex items-center gap-3"><span className="text-3xl" aria-hidden>{step.emoji}</span><h2 className="text-xl font-bold leading-tight">{step.title}</h2></div>
          <div className="mt-3 space-y-2 text-sm">{step.body.map((b, k) => <p key={k} className="serif whitespace-pre-line text-base leading-snug">{b}</p>)}</div>
          {step.name && (
            <label className="mt-3 block text-xs font-semibold text-muted" htmlFor="tour-name">What should we call you?
              <input id="tour-name" className="field mt-1 font-normal text-ink" defaultValue={name} onBlur={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
          )}
          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>{STEPS.map((s, k) => <span key={s.id} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`} />)}</div>
          <div className="mt-4 flex items-center gap-2">
            {!last && <button className="text-sm text-muted underline" onClick={() => onFinish(false)}>Skip tour</button>}
            <span className="flex-1" />
            {i > 0 && <button className="btn btn-ghost !min-h-10" onClick={() => setI(i - 1)}>Back</button>}
            {!last ? <button ref={nextRef} className="btn btn-primary !min-h-10" onClick={() => setI(i + 1)}>Next</button>
              : <><button className="btn btn-ghost !min-h-10" onClick={() => onFinish(false)}>Look around</button><button ref={nextRef} className="btn btn-primary !min-h-10" onClick={() => onFinish(true)}>Add my books</button></>}
          </div>
        </div>
      </div>
    </div>
  )
}
