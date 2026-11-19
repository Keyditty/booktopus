import Dexie, { type Table } from 'dexie'
import type { ActivityEvent, Book, ImportBatch, SourceRecord } from '../types'

export interface MetaCacheRow { key: string; value: unknown; at: number }

/**
 * Local-first persistence in the browser (IndexedDB). Table shapes are deliberately
 * relational (ids + foreign keys) so they map 1:1 onto Postgres tables later.
 * `userId` is not stored yet; a future multi-user build adds it to every table.
 */
export class ShelfDB extends Dexie {
  books!: Table<Book, string>
  sources!: Table<SourceRecord, string>
  events!: Table<ActivityEvent, string>
  batches!: Table<ImportBatch, string>
  cache!: Table<MetaCacheRow, string>

  constructor(name = 'booktopus') {
    super(name)
    this.version(1).stores({
      books: 'id, createdAt, createdBatchId, status',
      sources: 'id, bookId, key, batchId, source',
      events: 'id, bookId, key, batchId',
      batches: 'id, createdAt',
      cache: 'key',
    })
    // v2: index events by the copy they belong to (needed to move/delete a copy's history). Existing data is kept.
    this.version(2).stores({ events: 'id, bookId, key, batchId, sourceRecordId' })
  }
}

export let db = new ShelfDB()
/** Tests swap in an isolated database. */
export function useDatabase(name: string) { db = new ShelfDB(name); return db }
