import type { Candidate, SourceName } from '../../types'
import { parseListing } from './listing'

export interface OcrLine { text: string; conf: number; top: number; bottom: number; left: number }

/**
 * Turn OCR'd lines into book candidates. Lines are laid out as blocks (a larger vertical gap starts a new block),
 * then parsed with the same "Title / By: Author" logic used for copied text. OCR confidence is folded into the
 * candidate confidence, and metadata verification (later) decides whether it is trusted.
 */
export function ocrLinesToCandidates(lines: OcrLine[], source: SourceName, provenance: string): Candidate[] {
  const ls = lines.filter((l) => l.text.trim().length > 1).sort((a, b) => a.top - b.top || a.left - b.left)
  if (!ls.length) return []
  const heights = ls.map((l) => l.bottom - l.top).sort((a, b) => a - b)
  const med = heights[Math.floor(heights.length / 2)] || 20
  const blocks: OcrLine[][] = []
  let cur: OcrLine[] = []
  for (let i = 0; i < ls.length; i++) {
    const gap = i ? ls[i].top - ls[i - 1].bottom : 0
    if (i && gap > med * 1.1) { blocks.push(cur); cur = [] }
    cur.push(ls[i])
  }
  blocks.push(cur)
  const text = blocks.map((b) => b.map((l) => l.text.trim()).join('\n')).join('\n\n')
  const { candidates } = parseListing(text, source, { provenance })
  // average OCR confidence per candidate title line
  for (const c of candidates) {
    const hit = ls.find((l) => l.text.includes(c.title.slice(0, Math.min(12, c.title.length))))
    const oc = hit ? hit.conf / 100 : 0.6
    c.confidence = Math.min(c.confidence, 0.5 + oc * 0.4)
    c.format = c.format === 'unknown' && source === 'audible' ? 'audiobook' : c.format
  }
  return candidates
}

/** Fallback when only plain text (no boxes) is available. */
export function ocrTextToCandidates(text: string, source: SourceName, provenance: string): Candidate[] {
  return parseListing(text, source, { provenance }).candidates
}
