/** Starter genres offered in the picker. Anyone can still type their own; those are remembered via the library itself. */
export const KNOWN_GENRES = [
  'Romantasy', 'Fantasy Romance', 'Spicy Romance', 'Dark Romance', 'Paranormal Romance', 'Contemporary Romance', 'Historical Romance', 'Romantic Comedy', 'Erotic Romance',
  'Fantasy', 'Epic Fantasy', 'Urban Fantasy', 'Dark Fantasy', 'Cozy Fantasy', 'Science Fiction', 'Dystopian',
  'Mystery', 'Cozy Mystery', 'Thriller', 'Psychological Thriller', 'Suspense', 'Horror', 'Crime',
  'Historical Fiction', 'Literary Fiction', 'Contemporary Fiction', 'Women’s Fiction', 'Young Adult', 'New Adult', 'Middle Grade', 'Children’s',
  'Memoir', 'Biography', 'Self-Help', 'True Crime', 'History', 'Science', 'Business', 'Health', 'Religion & Spirituality', 'Travel', 'Cooking',
  'Classics', 'Humor', 'Graphic Novel', 'Poetry', 'Short Stories',
]

/** One-line plain-English hints for genre names people may not know. */
export const GENRE_HINTS: Record<string, string> = {
  Romantasy: 'Romantic fantasy: a love story set in a fantasy world. Very popular on BookTok, often the “spicy fantasy” books.',
  'Fantasy Romance': 'Like Romantasy: fantasy world, with the romance as a main plot.',
  'Spicy Romance': 'Romance with open-door, steamy scenes. Add this alongside the main genre if you like to track it.',
  'Dark Romance': 'Romance with darker themes and morally grey characters.',
  'Erotic Romance': 'Romance where the steamy scenes are central.',
  'Cozy Mystery': 'Gentle, low-violence whodunits, often in small towns.',
  'Cozy Fantasy': 'Low-stakes, comforting fantasy.',
  Dystopian: 'Stories set in a broken or oppressive future society.',
}

/** Trim, collapse spaces, and capitalise words ("spicy   fantasy" -> "Spicy Fantasy") while keeping short acronyms (YA). */
const ACRONYMS = new Set(['ya', 'na', 'lgbtq', 'lgbtq+', 'sf', 'ai', 'tbr'])
export function normalizeGenre(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.split(' ').map((w) => (ACRONYMS.has(w.toLowerCase()) || (w === w.toUpperCase() && w.length <= 3) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

/** Add a genre if it isn't already there (case-insensitive). */
export function withGenre(list: string[], raw: string): string[] {
  const g = normalizeGenre(raw)
  if (!g || list.some((x) => x.toLowerCase() === g.toLowerCase())) return list
  return [...list, g]
}
