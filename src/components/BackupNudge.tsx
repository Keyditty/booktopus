import { useState } from 'react'
import { downloadBackup } from '../lib/export'
import { getSettings, saveSettings } from '../lib/settings'

const DAY = 86400_000
/** iPhone/iPad Safari tab (not installed to the Home Screen): Safari may clear a site's saved data after about a week of no visits. */
const iosBrowserTab = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && (navigator as unknown as { standalone?: boolean }).standalone === false

/** A friendly, dismissible reminder to save a backup. Shows only once the shelf has real content. */
export function BackupNudge({ bookCount }: { bookCount: number }) {
  const [hidden, setHidden] = useState(false)
  const [saved, setSaved] = useState(false)
  const s = getSettings()
  const last = s.lastBackupAt ? new Date(s.lastBackupAt).getTime() : 0
  const snoozed = s.backupSnoozeUntil && new Date(s.backupSnoozeUntil).getTime() > Date.now()
  if (saved) return <p role="status" className="card mx-auto mt-4 max-w-[460px] p-3 text-center text-sm text-sage">✓ Backup saved. Keep that file somewhere safe, like your email or cloud drive.</p>
  if (hidden || snoozed || bookCount < 5 || (last && Date.now() - last < 30 * DAY)) return null
  return (
    <section className="card mx-auto mt-4 max-w-[460px] p-4" aria-label="Back up your library">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>💾</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold">{last ? 'Time for a fresh backup' : 'Save a backup of your library'}</h2>
          <p className="serif text-sm text-muted">Your books are stored only on this device. A backup file means you can never lose them. It takes two seconds.</p>
          {iosBrowserTab() && <p className="mt-1 text-xs text-gold">iPhone tip: tap Share, then “Add to Home Screen”. Safari can clear an ordinary web page’s saved data if you don’t visit for about a week.</p>}
          <div className="mt-2 flex items-center gap-3">
            <button className="btn btn-primary !min-h-9 !px-4 !py-1 text-sm" onClick={async () => { await downloadBackup(); setSaved(true) }}>Download backup</button>
            <button className="text-xs text-muted underline" onClick={() => { saveSettings({ backupSnoozeUntil: new Date(Date.now() + 7 * DAY).toISOString() }); setHidden(true) }}>Remind me later</button>
          </div>
        </div>
      </div>
    </section>
  )
}
