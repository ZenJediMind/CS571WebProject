import { readKey, writeKey } from './storage'

const SETTINGS_KEY = 'settings'

export const GHOST_MODES = { OFF: 'off', BEST: 'best', RIVALS: 'rivals', BOTH: 'both' }

const DEFAULT_SETTINGS = { ghosts: GHOST_MODES.BOTH, sound: true }

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readKey(SETTINGS_KEY, {}) }
}

export function saveSettings(partial) {
  const next = { ...getSettings(), ...partial }
  writeKey(SETTINGS_KEY, next)
  return next
}
