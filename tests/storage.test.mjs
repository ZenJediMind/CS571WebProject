import test from 'node:test'
import assert from 'node:assert/strict'
import { readKey, writeKey } from '../src/services/storage.js'

test('writeKey reports failure when storage is unavailable', () => {
  assert.equal(writeKey('probe', { value: 1 }), false)
})

test('readKey falls back when storage is unavailable', () => {
  assert.equal(readKey('probe', 'fallback'), 'fallback')
})
