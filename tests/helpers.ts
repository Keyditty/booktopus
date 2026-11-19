import 'fake-indexeddb/auto'
import { useDatabase } from '../src/lib/db'
import { Dexie } from 'dexie'
let n = 0
export async function freshDb() { const d = useDatabase(`test-${++n}-${Math.random()}`); await d.open(); return d }
export { Dexie }
