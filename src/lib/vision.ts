import type { Candidate, SourceName } from '../types'
import { splitAuthors } from './normalize'
import { makeCandidate } from './importers/common'
import { jpegBase64 } from './ocr'
import { VISION_MODEL } from './settings'

/**
 * OPTIONAL, user-controlled AI vision. Sends the chosen screenshots to Anthropic's API using the user's own key
 * (kept in this browser only). The UI discloses this and requires an explicit opt-in per batch.
 * EXPERIMENTAL: written against the public Messages API but not exercised end-to-end during development
 * (no key was available).
 */


const PROMPT = `These are screenshots of a person's book library (cover grids or lists). List every distinct book whose TITLE you can actually read. Do not guess or invent any book that is not clearly visible; leave "author" empty if it is not shown. Ignore any personal information that is not a book (names, emails, account details). Reply with ONLY JSON: {"books":[{"title":"...","author":"...","narrator":"..."}]}`

export async function visionExtract(files: Blob[], apiKey: string, source: SourceName): Promise<Candidate[]> {
  const content: unknown[] = []
  for (const f of files) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await jpegBase64(f) } })
  content.push({ type: 'text', text: PROMPT })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 2000, messages: [{ role: 'user', content }] }),
  })
  if (!r.ok) throw new Error(`Vision request failed (${r.status})`)
  const data = await r.json()
  const text: string = (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return []
  const books: { title?: string; author?: string; narrator?: string }[] = JSON.parse(json).books ?? []
  return books.filter((b) => b.title).map((b) => makeCandidate({
    title: b.title!, authors: b.author ? splitAuthors(b.author) : [], narrator: b.narrator || undefined, source,
    format: source === 'audible' ? 'audiobook' : 'unknown', provenance: 'AI vision (user-enabled)', confidence: 0.7,
  }))
}
