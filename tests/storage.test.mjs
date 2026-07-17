import test from 'node:test'
import assert from 'node:assert/strict'
import { readArray, readKey, readObject, writeKey } from '../src/services/storage.js'
import { getSettings, saveSettings } from '../src/services/settingsService.js'

test('writeKey reports failure when storage is unavailable', () => {
  assert.equal(writeKey('probe', { value: 1 }), false)
})

test('readKey falls back when storage is unavailable', () => {
  assert.equal(readKey('probe', 'fallback'), 'fallback')
})

test('readArray and readObject fall back for missing storage', () => {
  assert.deepEqual(readArray('missing-array', []), [])
  assert.deepEqual(readObject('missing-object', {}), {})
})

test('saveSettings reports failure when storage is unavailable', () => {
  assert.equal(saveSettings({ sound: false }), null)
})

test('getSettings ignores corrupt ghost mode values', () => {
  const settings = getSettings()
  assert.equal(settings.ghosts, 'both')
  assert.equal(settings.sound, true)
})
