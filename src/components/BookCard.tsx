import { Cover } from './Cover'
import { SERVICE_COLOR, SERVICE_LABEL, STATUS_LABEL, type BookView } from '../lib/shelves'

export function BookCard({ v, onOpen }: { v: BookView; onOpen: () => void }) {
  const b = v.book
  const ribbon = b.status === 'in_progress' ? 'Reading' : b.status === 'finished' ? 'Finished' : b.wantToRead ? 'Want' : v.borrowed ? 'Borrowed' : ''
  return (
    <div className="cell">
      <button onClick={onOpen} className="block w-full text-left" aria-label={`${b.title}${b.authors[0] ? ' by ' + b.authors[0] : ''}. ${STATUS_LABEL[b.status]}. Open details`}>
        <div className="relative">
          <Cover title={b.title} author={b.authors[0]} url={b.coverUrl} />
          {ribbon && <span className="absolute left-0 top-2 rounded-r-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{ribbon}</span>}
          {b.spice ? <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white" title={`Spice level ${b.spice} of 5`}>🌶{b.spice}</span> : null}
          {b.favorite && <span className="absolute right-1.5 top-1.5 text-lg drop-shadow" aria-label="Favorite">❤️</span>}
          <span className="absolute bottom-1.5 left-1.5 flex gap-1">
            {v.services.filter((s) => s !== 'manual' && s !== 'screenshot' && s !== 'chatgpt').map((s) => (
              <span key={s} title={SERVICE_LABEL[s]} className="h-3 w-3 rounded-full border border-white/80 shadow" style={{ background: SERVICE_COLOR[s] }} />
            ))}
          </span>
        </div>
        <div className="mt-2 px-0.5">
          <div className="serif text-sm font-semibold leading-tight line-clamp-2">{b.title}</div>
          <div className="mt-0.5 text-xs text-muted line-clamp-1">{b.authors.join(', ')}</div>
          {b.rating ? <div className="mt-0.5 text-[11px] text-gold" aria-label={`${b.rating} stars`}>{'★'.repeat(b.rating)}<span className="text-mist">{'★'.repeat(5 - b.rating)}</span></div> : null}
        </div>
      </button>
    </div>
  )
}
