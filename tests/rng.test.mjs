import test from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../src/game/rng.js'

test('mulberry32 is deterministic per seed', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  assert.equal(a(), b())
  assert.equal(a(), b())
})

test('mulberry32 yields floats in [0, 1)', () => {
  const rand = mulberry32(7)
  for (let i = 0; i < 100; i++) {
    const value = rand()
    assert.ok(value >= 0 && value < 1, `out of range: ${value}`)
  }
})

test('different seeds diverge', () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)())
})
