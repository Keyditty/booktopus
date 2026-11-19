export const SPICE_LABELS = ['No spice', 'Mild: kisses, closed door', 'Warm: some steam', 'Steamy', 'Hot: explicit', 'Scorching'] as const

/** 🌶 spice level, 0 (none) to 5. Tap the same level again to clear it. */
export function SpiceInput({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Spice level">
        <button type="button" role="radio" aria-checked={value === 0} className={`btn !min-h-9 !px-3 !py-1 text-xs ${value === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange(value === 0 ? undefined : 0)}>None</button>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`Spice ${n} of 5: ${SPICE_LABELS[n]}`} onClick={() => onChange(value === n ? undefined : n)}
            className={`h-11 w-9 text-2xl leading-none transition ${(value ?? 0) >= n ? '' : 'opacity-25 grayscale'}`}>🌶</button>
        ))}
      </div>
      <p className="mt-0.5 text-xs text-muted">{value == null ? 'Not set. Tap a pepper to rate how spicy it is.' : SPICE_LABELS[value]}</p>
    </div>
  )
}
