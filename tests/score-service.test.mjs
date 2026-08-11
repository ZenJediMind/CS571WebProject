import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATE_COURSES } from '../src/game/templates.js'
import { createAutopilotCursor, autopilotInputs } from '../src/game/autopilot.js'
import { createRaceState, stepRace } from '../src/game/engine.js'
import {
  getCourseLeaderboard,
  getBestTime,
  getRivalTimes,
  getTotalPoints,
  recordTime,
  recordTimeOnce,
} from '../src/services/scoreService.js'

function installStorage({ failWrites = false } = {}) {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('storage blocked')
      values.set(key, value)
    },
  }
  globalThis.localStorage = storage
  globalThis.sessionStorage = storage
}

test('recordTime persists a best time and leaderboard uses the saved value', () => {
  installStorage()
  const courseId = 'tpl-capitol-loop'
  const award = recordTime(courseId, 1000)
  const rivals = getRivalTimes(courseId)
  const playerRow = getCourseLeaderboard(courseId).find((row) => row.isPlayer)

  assert.equal(award.newBest, true)
  assert.equal(award.bestTimeSaved, true)
  assert.equal(award.pointsEarned, rivals.length * 10 + 5)
  assert.equal(getBestTime(courseId), 1000)
  assert.equal(playerRow.ms, 1000)
  assert.equal(getTotalPoints(), award.pointsEarned)
})

test('a finished race saves its elapsed time to that course leaderboard', () => {
  installStorage()
  const course = TEMPLATE_COURSES[0]
  const state = createRaceState(course)
  const cursor = createAutopilotCursor()
  for (let i = 0; i < 180 * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
  }

  assert.equal(state.finished, true)
  const award = recordTimeOnce('finished-race', course.id, Math.round(state.elapsedMs))
  const playerRow = getCourseLeaderboard(course.id).find((row) => row.isPlayer)

  assert.equal(award.bestTimeSaved, true)
  assert.equal(playerRow.ms, Math.round(state.elapsedMs))
})

test('recordTimeOnce does not award the same result twice', () => {
  installStorage()
  const first = recordTimeOnce('result-1', 'tpl-ring-road', 1000)
  const second = recordTimeOnce('result-1', 'tpl-ring-road', 1000)

  assert.deepEqual(second, first)
  assert.equal(getTotalPoints(), first.pointsEarned)
})

test('a blocked best-time write is visible to the caller and leaderboard', () => {
  installStorage({ failWrites: true })
  const courseId = 'tpl-mad-town-gp'
  const award = recordTime(courseId, 1000)

  assert.equal(award.newBest, false)
  assert.equal(award.bestTimeSaved, false)
  assert.equal(getBestTime(courseId), null)
  assert.equal(getCourseLeaderboard(courseId).some((row) => row.isPlayer), false)
})

test('invalid race times are not persisted or awarded', () => {
  installStorage()
  const award = recordTime('tpl-ring-road', Number.NaN)

  assert.equal(award.bestTimeSaved, false)
  assert.equal(award.pointsEarned, 0)
  assert.equal(getBestTime('tpl-ring-road'), null)
})
