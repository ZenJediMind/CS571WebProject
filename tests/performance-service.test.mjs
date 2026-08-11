import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPerformanceStats,
  profileSync,
  recordPerformance,
  resetPerformanceStats,
} from '../src/services/performanceService.js'

test('performance profiling keeps bounded aggregate statistics', () => {
  resetPerformanceStats()
  recordPerformance('test.metric', 2)
  recordPerformance('test.metric', 8)
  profileSync('test.operation', () => 42)

  const metric = getPerformanceStats().find((entry) => entry.name === 'test.metric')
  assert.equal(metric.count, 2)
  assert.equal(metric.minMs, 2)
  assert.equal(metric.maxMs, 8)
  assert.equal(metric.averageMs, 5)
  assert.equal(getPerformanceStats().some((entry) => entry.name === 'test.operation'), true)
})
