import { useMemo } from 'react'
import { Cover } from './Cover'
import { Octopus } from './Octopus'
import { inShelf, type BookView, type ShelfId } from '../lib/shelves'

function greeting(name: string) {
  const h = new Date().getHours()
  return h < 5 ? `Still up, ${name}?` : h < 12 ? `Good morning, ${name}` : h < 18 ? `Good afternoon, ${name}` : `Good evening, ${name}`
}

function Row({ title, hint, views, onOpen, onSeeAll }: { title: string; hint?: string; views: BookView[]; onOpen: (id: string) => void; onSeeAll?: () => void }) {
  if (!views.length) return null
  return (
    <section className="mt-8" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-base font-bold sm:text-lg">{title}{hint && <span className="ml-2 font-sans text-xs font-normal text-muted">{hint}</span>}</h2>
        {onSeeAll && <button className="text-sm text-accent underline" onClick={onSeeAll}>See all</button>}
      </div>
      <div className="relative mt-3">
        <div className="scroll-x flex gap-4 px-1 pb-5">
          {views.slice(0, 14).map((v) => (
            <button key={v.book.id} onClick={() => onOpen(v.book.id)} className="group w-[92px] shrink-0 text-left sm:w-[108px]" aria-label={`${v.book.title}${v.book.authors[0] ? ' by ' + v.book.authors[0] : ''}`}>
              <div className="transition-transform group-hover:-translate-y-1"><Cover title={v.book.title} author={v.book.authors[0]} url={v.book.coverUrl} /></div>
              <div className="serif mt-1.5 line-clamp-2 text-xs font-semibold leading-tight">{v.book.title}</div>
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 rounded" style={{ background: 'linear-gradient(var(--plank-1), var(--plank-2) 55%, var(--plank-3))', boxShadow: '0 8px 14px -6px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.22)' }} />
      </div>
    </section>
  )
}

export function Home({ views, name, onOpen, onShelf, onAdd, onManual }: {
  views: BookView[]; name: string; onOpen: (id: string) => void; onShelf: (s: ShelfId) => void; onAdd: () => void; onManual: () => void
}) {
  const year = String(new Date().getFullYear())
  const finishedThisYear = views.filter((v) => v.book.status === 'finished' && v.book.finishedAt?.startsWith(year)).length
  const by = useMemo(() => {
    const rec = [...views].sort((a, b) => b.book.createdAt.localeCompare(a.book.createdAt))
    const fin = views.filter((v) => inShelf(v, 'finished')).sort((a, b) => (b.book.finishedAt ?? '').localeCompare(a.book.finishedAt ?? ''))
    return { rec, fin, want: views.filter((v) => inShelf(v, 'want')), fav: views.filter((v) => inShelf(v, 'favorites')), borrowed: views.filter((v) => inShelf(v, 'borrowed')) }
  }, [views])
  const surprise = () => {
    const pool = by.want.length ? by.want : views.filter((v) => v.book.status === 'unknown')
    if (pool.length) onOpen(pool[Math.floor(Math.random() * pool.length)].book.id)
  }
  return (
    <div className="fade-in">
      <div className="text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">{greeting(name)}</h2>
        <p className="serif text-muted">{views.length} books in your library{finishedThisYear ? ` · ${finishedThisYear} finished this year` : ''}</p>
      </div>
      <Octopus views={views} allViews={views} onOpen={onOpen} />
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button className="btn btn-primary" onClick={onAdd}>＋ Add books</button>
        <button className="btn btn-ghost" onClick={onManual}>✍️ Add one by hand</button>
        <button className="btn btn-ghost" onClick={surprise}>🎲 Surprise me</button>
      </div>
      <Row title="Fresh catch" hint="recently added" views={by.rec} onOpen={onOpen} onSeeAll={() => onShelf('all')} />
      <Row title="Want to read" views={by.want} onOpen={onOpen} onSeeAll={() => onShelf('want')} />
      <Row title="Finished lately" views={by.fin} onOpen={onOpen} onSeeAll={() => onShelf('finished')} />
      <Row title="Favorites" views={by.fav} onOpen={onOpen} onSeeAll={() => onShelf('favorites')} />
      <Row title="Borrowed right now" views={by.borrowed} onOpen={onOpen} onSeeAll={() => onShelf('borrowed')} />
    </div>
  )
}
