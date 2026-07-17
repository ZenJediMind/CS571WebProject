import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMs } from '../src/services/scoreService.js'

test('formatMs pads tenths of a second', () => {
  assert.equal(formatMs(0), '0:00.0')
  assert.equal(formatMs(1000), '0:01.0')
  assert.equal(formatMs(12500), '0:12.5')
})

test('formatMs carries a rounded 60.0s into the next minute', () => {
  assert.equal(formatMs(59950), '1:00.0')
  assert.equal(formatMs(60000), '1:00.0')
  assert.equal(formatMs(61500), '1:01.5')
})
