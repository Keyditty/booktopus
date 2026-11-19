import { useEffect, useMemo, useState } from 'react'
import { loadLibrary, subscribe, type LibraryData } from './store'
import { buildViews } from './shelves'

export function useLibrary() {
  const [data, setData] = useState<LibraryData | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => loadLibrary().then((d) => { if (alive) setData(d) })
    load()
    const off = subscribe(load)
    return () => { alive = false; off() }
  }, [])
  const views = useMemo(() => (data ? buildViews(data.books, data.sources) : []), [data])
  return { data, views, loading: !data }
}
