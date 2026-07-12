import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { CELL_SIZE } = await loadGameModule('courseModel')
const { TEMPLATE_COURSES } = await loadGameModule('templates')
const { createRaceState, stepRace } = await loadGameModule('engine')

const center = (cell) => ({ x: (cell.col + 0.5) * CELL_SIZE, y: (cell.row + 0.5) * CELL_SIZE })
const normalizeAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function driveInputs(state, cursor) {
  const target = center(state.path[cursor.targetIdx])
  if (Math.hypot(target.x - state.x, target.y - state.y) < CELL_SIZE * 0.45) {
    cursor.targetIdx = (cursor.targetIdx + 1) % state.path.length
  }
  const aim = center(state.path[cursor.targetIdx])
  const diff = normalizeAngle(Math.atan2(aim.y - state.y, aim.x - state.x) - state.heading)
  if (Math.abs(state.speed) < 8 && Math.abs(diff) > 2.0) {
    return { up: false, down: true, left: diff > 0, right: diff < 0 }
  }
  const cornering = Math.abs(diff) > 0.35
  return {
    up: state.speed < 80 || (Math.abs(diff) < 1.0 && (!cornering || state.speed < 150)),
    down: cornering && state.speed > 170,
    left: diff < -0.05,
    right: diff > 0.05,
  }
}

function runToFinish(course, maxSimSeconds = 180) {
  const state = createRaceState(course)
  const cursor = { targetIdx: 1 }
  for (let i = 0; i < maxSimSeconds * 60 && !state.finished; i++) {
    stepRace(state, driveInputs(state, cursor), 1 / 60)
  }
  return state
}

for (const course of TEMPLATE_COURSES) {
  test(`autopilot finishes 3 laps on ${course.id}`, () => {
    const state = runToFinish(course)
    assert.equal(state.finished, true)
    assert.equal(state.lap, 3)
  })
}

test('engine is deterministic', () => {
  assert.equal(runToFinish(TEMPLATE_COURSES[0]).elapsedMs, runToFinish(TEMPLATE_COURSES[0]).elapsedMs)
})
