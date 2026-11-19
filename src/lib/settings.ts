// Per-device settings. Keys live only in this browser's localStorage and are never sent anywhere except the
// provider they belong to. (try/catch: storage can be unavailable in private windows.)
export type ThemeName = 'deep' | 'lagoon'
export interface Settings { googleKey: string; anthropicKey: string; lookupOnline: boolean; theme: ThemeName }
const KEY = 'booktopus-settings'
const DEFAULTS: Settings = { googleKey: '', anthropicKey: '', lookupOnline: true, theme: 'deep' }
export function getSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULTS }
}
export function saveSettings(s: Partial<Settings>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...s })) } catch { /* ignore */ }
}
export const VISION_MODEL = 'claude-haiku-5-5'
