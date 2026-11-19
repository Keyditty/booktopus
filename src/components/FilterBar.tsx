import { useState } from 'react'
import { FORMAT_LABEL, NO_FILTERS, SERVICE_LABEL, STATUS_LABEL, distinct, type BookView, type Filters, type SortKey } from '../lib/shelves'

export function FilterBar({ views, filters, setFilters, sort, setSort }: { views: BookView[]; filters: Filters; setFilters: (f: Filters) => void; sort: SortKey; setSort: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const active = Object.entries(filters).filter(([, v]) => v).length
  const set = (k: keyof Filters, v: string | number) => setFilters({ ...filters, [k]: v })
  const Sel = ({ k, label, opts }: { k: keyof Filters; label: string; opts: [string, string][] }) => (
    <label className="block text-xs font-semibold text-muted">{label}
      <select className="field mt-1 text-sm font-normal text-ink" value={String(filters[k])} onChange={(e) => set(k, e.target.value)}>
        <option value="">Any</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
  return (
    <div>
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost !min-h-10 !py-1.5 text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          Filter{active ? ` (${active})` : ''} <span aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
        {active > 0 && <button className="text-sm text-rust underline" onClick={() => setFilters(NO_FILTERS)}>Clear</button>}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">Sort
          <select className="field !min-h-10 !w-auto !py-1.5 text-sm text-ink" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort books">
            <option value="added">Recently added</option><option value="title">Title</option><option value="author">Author</option><option value="completed">Date finished</option>
          </select>
        </label>
      </div>
      {open && (
        <div className="card fade-in mt-3 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          <Sel k="source" label="Service" opts={distinct(views, (v) => v.services).map((s) => [s, SERVICE_LABEL[s as keyof typeof SERVICE_LABEL] ?? s])} />
          <Sel k="status" label="Status" opts={Object.entries(STATUS_LABEL).map(([k, l]) => [k, l])} />
          <Sel k="format" label="Format" opts={distinct(views, (v) => v.formats).map((f) => [f, FORMAT_LABEL[f as keyof typeof FORMAT_LABEL]])} />
          <Sel k="genre" label="Genre" opts={distinct(views, (v) => v.book.genres).map((g) => [g, g])} />
          <Sel k="author" label="Author" opts={distinct(views, (v) => v.book.authors).map((a) => [a, a])} />
          <Sel k="series" label="Series" opts={distinct(views, (v) => [v.book.series]).map((s) => [s, s])} />
          <Sel k="spice" label="Spice level" opts={[['none', 'None'], ['1', '🌶 1 and up'], ['3', '🌶🌶🌶 3 and up'], ['5', '🌶🌶🌶🌶🌶 5 only']]} />
          <label className="block text-xs font-semibold text-muted">My rating
            <select className="field mt-1 text-sm font-normal text-ink" value={filters.minRating} onChange={(e) => set('minRating', +e.target.value)}>
              <option value={0}>Any</option>{[5, 4, 3, 2].map((n) => <option key={n} value={n}>{n}★ and up</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
