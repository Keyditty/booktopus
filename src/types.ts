// ---- Domain model ---------------------------------------------------------
// Source activity (what happened on a service) is stored on SourceRecord/ActivityEvent.
// Personal reading status (did the reader read it) is stored on Book. They never overwrite each other.

export type SourceName = 'audible' | 'libby' | 'hoopla' | 'chatgpt' | 'screenshot' | 'manual' | 'other'
export type Format = 'audiobook' | 'ebook' | 'print' | 'comic' | 'unknown'
export type ReadingStatus = 'unknown' | 'not_started' | 'in_progress' | 'finished' | 'dnf'
export type SourceActivity = 'purchased' | 'borrowed' | 'returned' | 'hold' | 'available' | 'unknown'
export type EventType = 'purchased' | 'borrowed' | 'returned' | 'hold' | 'renewed' | 'other'

export interface Identifiers {
  isbn?: string
  asin?: string
  gbId?: string // Google Books volume id
  olId?: string // Open Library work/edition key
  sourceIds?: string[] // e.g. "libby:123"
}

export interface Reading {
  startedAt?: string
  finishedAt?: string
}

export interface Book {
  id: string
  title: string
  subtitle?: string
  authors: string[]
  narrator?: string
  series?: string
  seriesNumber?: number
  synopsis?: string
  genres: string[]
  year?: number
  coverUrl?: string
  identifiers: Identifiers
  // personal tracking
  status: ReadingStatus
  statusSource: 'import' | 'user' // imports never override a user-set status
  wantToRead: boolean
  favorite: boolean
  /** which of the octopus's 8 arms (0-7) holds this book; reading vs up-next is derived from status */
  arm?: number
  rating?: number // 1-5
  notes?: string
  startedAt?: string
  finishedAt?: string
  readings: Reading[] // previous read-throughs ("read again")
  // bookkeeping
  userEdited: string[] // field names the user changed by hand; imports never overwrite these
  createdAt: string
  updatedAt: string
  createdBatchId?: string
}

export interface CompletionHint {
  value: 'finished' | 'in_progress'
  note: string // where it came from, e.g. "Audible page said 'Finished'"
}

export interface SourceRecord {
  id: string
  bookId: string
  key: string // idempotency key
  source: SourceName
  format: Format
  sourceId?: string
  activity: SourceActivity
  borrowedAt?: string
  returnedAt?: string
  library?: string
  completionHint?: CompletionHint
  provenance: string
  batchId: string
  addedAt: string
}

export interface ActivityEvent {
  id: string
  bookId: string
  sourceRecordId: string
  key: string // idempotency key
  type: EventType
  date?: string
  detail?: string
  batchId: string
}

export interface ImportBatch {
  id: string
  adapter: string
  label: string
  createdAt: string
  booksCreated: number
  booksMerged: number
  sourceRecords: number
  events: number
  undone?: boolean
}

// ---- Import pipeline -------------------------------------------------------

/** The common normalized intermediate record every importer produces. */
export interface Candidate {
  title: string
  subtitle?: string
  authors: string[]
  narrator?: string
  series?: string
  seriesNumber?: number
  format: Format
  source: SourceName
  sourceId?: string
  identifiers: Identifiers
  activity: SourceActivity
  events: { type: EventType; date?: string; detail?: string }[]
  library?: string
  status?: ReadingStatus // only when explicitly stated
  wantToRead?: boolean
  favorite?: boolean
  rating?: number
  notes?: string
  startedAt?: string
  finishedAt?: string
  genres?: string[]
  synopsis?: string
  coverUrl?: string
  year?: number
  completionHint?: CompletionHint
  /** extra service/format copies of this same book detected in the same batch (e.g. Audible + Libby) */
  others?: SourceEntry[]
  /** 0..1 how sure we are that this is a real book record with the right title/author */
  confidence: number
  provenance: string
  /** set once metadata enrichment has run */
  enriched?: 'matched' | 'unmatched' | 'skipped'
  enrichScore?: number
}

export interface SourceEntry {
  source: SourceName; format: Format; sourceId?: string; activity: SourceActivity; library?: string
  completionHint?: CompletionHint; provenance: string; events: { type: EventType; date?: string; detail?: string }[]
}

export type ReviewCategory = 'new' | 'existing' | 'possible' | 'review' | 'unrecognized'

export interface ReviewItem {
  id: string
  candidate: Candidate
  category: ReviewCategory
  matchBookId?: string
  matchTitle?: string
  matchScore?: number
  include: boolean
  /** number of times this book was detected within the batch (screenshots overlap) */
  detections: number
  reason?: string
}
