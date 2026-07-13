import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { THEMES, DEFAULT_THEME_ID, getTheme } = await loadGameModule('themes')

test('every theme has the required shape', () => {
  for (const theme of THEMES) {
    assert.equal(typeof theme.id, 'string')
    assert.equal(typeof theme.name, 'string')
    assert.equal(typeof theme.emoji, 'string')
    assert.equal(typeof theme.grip, 'number')
    assert.equal(typeof theme.drawTerrain, 'function')
    for (const key of ['road', 'curbRed', 'curbWhite', 'dash', 'margin']) {
      assert.match(theme.track[key], /^#[0-9a-fA-F]{6}$/, `${theme.id}.track.${key}`)
    }
  }
})

test('grip values stay in a sane range', () => {
  for (const theme of THEMES) {
    assert.ok(theme.grip >= 0.7 && theme.grip <= 1.0, `${theme.id} grip ${theme.grip}`)
  }
})

test('getTheme falls back to circuit for unknown or missing id', () => {
  assert.equal(getTheme('nope').id, DEFAULT_THEME_ID)
  assert.equal(getTheme(undefined).id, DEFAULT_THEME_ID)
  assert.equal(getTheme('circuit').id, 'circuit')
})

test('the default theme exists and is tarmac grip', () => {
  assert.equal(getTheme(DEFAULT_THEME_ID).grip, 1.0)
})
