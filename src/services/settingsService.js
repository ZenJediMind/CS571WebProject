import { readObject, writeKey } from './storage.js'

const SETTINGS_KEY = 'settings'

export const GHOST_MODES = { OFF: 'off', BEST: 'best', RIVALS: 'rivals', BOTH: 'both' }

const DEFAULT_SETTINGS = { ghosts: GHOST_MODES.BOTH, sound: true }
const GHOST_MODE_VALUES = new Set(Object.values(GHOST_MODES))

export function getSettings() {
  const raw = readObject(SETTINGS_KEY, {})
  return {
    ghosts: GHOST_MODE_VALUES.has(raw.ghosts) ? raw.ghosts : DEFAULT_SETTINGS.ghosts,
    sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_SETTINGS.sound,
  }
}

export function saveSettings(partial) {
  const next = { ...getSettings(), ...partial }
  if (!GHOST_MODE_VALUES.has(next.ghosts)) next.ghosts = DEFAULT_SETTINGS.ghosts
  if (typeof next.sound !== 'boolean') next.sound = DEFAULT_SETTINGS.sound
  return writeKey(SETTINGS_KEY, next) ? next : null
}
