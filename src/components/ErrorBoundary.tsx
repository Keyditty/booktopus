import { Component, type ReactNode } from 'react'
import { downloadBackup } from '../lib/export'

/** Last line of defence: if any screen throws, show a calm message instead of a blank page. The library is stored separately and stays safe. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; saved: boolean }> {
  state = { error: null as Error | null, saved: false }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('Booktopus crashed:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-16 max-w-md px-4">
        <div className="card p-6 text-center" role="alert">
          <div className="text-5xl" aria-hidden>🐙</div>
          <h1 className="mt-3 text-xl font-bold">Oops, the octopus tangled an arm</h1>
          <p className="serif mt-2 text-muted">Something went wrong on this screen. <strong>Your books are safe</strong>; they’re saved separately on this device.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button className="btn btn-primary" onClick={() => { location.hash = ''; this.setState({ error: null }) }}>Go back to Home</button>
            <button className="btn btn-ghost" onClick={async () => { try { await downloadBackup(); this.setState({ saved: true }) } catch { /* ignore */ } }}>Download a backup now</button>
            <button className="btn btn-ghost" onClick={() => location.reload()}>Reload the app</button>
          </div>
          {this.state.saved && <p role="status" className="mt-3 text-xs text-sage">✓ Backup downloaded.</p>}
          <details className="mt-4 text-left text-xs text-muted"><summary className="cursor-pointer">Technical details (send these to the developer)</summary><pre className="mt-1 whitespace-pre-wrap break-words">{String(this.state.error?.message)}</pre></details>
        </div>
      </div>
    )
  }
}
