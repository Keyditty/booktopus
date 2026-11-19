import type { Book } from '../types'

export const ARM_COUNT = 8
export type ArmMode = 'reading' | 'queued'

const active = (b: Book) => b.status !== 'finished' && b.status !== 'dnf'

/**
 * Which book sits on each of the octopus's eight arms.
 * A book keeps the arm stored on it; books that are "in progress" but have no arm yet
 * (e.g. marked Reading before arms existed) fill whichever arms are still free.
 */
export function assignArms(books: Book[]): (Book | undefined)[] {
  const slots: (Book | undefined)[] = Array(ARM_COUNT).fill(undefined)
  for (const b of books) {
    if (typeof b.arm === 'number' && b.arm >= 0 && b.arm < ARM_COUNT && !slots[b.arm] && active(b)) slots[b.arm] = b
  }
  const loose = books
    .filter((b) => b.status === 'in_progress' && !slots.includes(b))
    .sort((a, b) => (b.startedAt ?? b.updatedAt).localeCompare(a.startedAt ?? a.updatedAt))
  for (const b of loose) {
    const i = slots.findIndex((x) => !x)
    if (i < 0) break
    slots[i] = b
  }
  return slots
}

export const armMode = (b: Book): ArmMode => (b.status === 'in_progress' ? 'reading' : 'queued')
