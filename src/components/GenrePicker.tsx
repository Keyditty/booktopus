import { useId, useState } from 'react'
import { GENRE_HINTS, KNOWN_GENRES, normalizeGenre, withGenre } from '../lib/genres'

/** Chips for the genres a book has, plus a box to add any genre (suggestions come from the starter list and your own shelf). */
export function GenrePicker({ value, onChange, known = [] }: { value: string[]; onChange: (g: string[]) => void; known?: string[] }) {
  const [text, setText] = useState('')
  const listId = useId()
  const options = [...new Set([...known, ...KNOWN_GENRES])].filter((g) => !value.some((v) => v.toLowerCase() === g.toLowerCase()))
  const add = (g: string) => { const next = withGenre(value, g); if (next !== value) onChange(next); setText('') }
  const hint = GENRE_HINTS[normalizeGenre(text)] ?? GENRE_HINTS[value[value.length - 1] ?? '']
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" aria-label="Genres">
        {value.map((g) => (
          <span key={g} className="inline-flex items-center gap-1 rounded-full bg-mist py-0.5 pl-2.5 pr-1 text-xs">
            {g}<button type="button" className="h-5 w-5 rounded-full text-muted hover:text-rust" aria-label={`Remove ${g}`} onClick={() => onChange(value.filter((x) => x !== g))}>✕</button>
          </span>
        ))}
        {!value.length && <span className="text-xs text-muted">No genres yet</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="field !min-h-10 flex-1 text-sm" list={listId} value={text} placeholder="Add a genre, e.g. Romantasy" aria-label="Add a genre"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }} />
        <datalist id={listId}>{options.map((g) => <option key={g} value={g} />)}</datalist>
        <button type="button" className="btn btn-ghost !min-h-10 !py-1 text-sm" disabled={!text.trim()} onClick={() => add(text)}>Add</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.slice(0, 8).map((g) => <button key={g} type="button" className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:bg-mist hover:text-ink" onClick={() => add(g)}>＋ {g}</button>)}
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  )
}
