import test from 'node:test'
import assert from 'node:assert/strict'
import { getRivalTimes, hashString, scoreInternals } from '../src/services/scoreService.js'

test('simulated rival times are deterministic for the same course', () => {
  assert.deepEqual(getRivalTimes('tpl-capitol-loop'), getRivalTimes('tpl-capitol-loop'))
  assert.notDeepEqual(getRivalTimes('tpl-capitol-loop'), getRivalTimes('tpl-ring-road'))
  assert.equal(hashString('Wisconsin Racer'), hashString('Wisconsin Racer'))
})

test('leaderboard rows keep only each racer’s best time', () => {
  const bestRows = scoreInternals.bestByRacer([
    { racer_name: 'Racer-A', time_ms: 32000 },
    { racer_name: 'Racer-B', time_ms: 31000 },
    { racer_name: 'Racer-A', time_ms: 30000 },
  ])

  assert.deepEqual(bestRows, [
    { racer_name: 'Racer-A', time_ms: 30000 },
    { racer_name: 'Racer-B', time_ms: 31000 },
  ])
})

test('invalid backend race input is rejected before a request is made', () => {
  assert.throws(() => scoreInternals.assertRaceInput('result', 'course', 0, 1000))
  assert.throws(() => scoreInternals.assertRaceInput('', 'course', 1, 1000))
  assert.throws(() => scoreInternals.assertRaceInput('result', 'course', 1, Number.NaN))
})
