import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATE_COURSES } from '../src/game/templates.js'
import { createRaceState, stepRace } from '../src/game/engine.js'
import { createAutopilotCursor, autopilotInputs } from '../src/game/autopilot.js'
import { getTheme } from '../src/game/themes.js'

function runToFinish(course, maxSimSeconds = 180) {
  const state = createRaceState(course)
  const cursor = createAutopilotCursor()
  for (let i = 0; i < maxSimSeconds * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
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

test('long frames record full elapsed time with identical physics', () => {
  const chopped = createRaceState(TEMPLATE_COURSES[0])
  const long = createRaceState(TEMPLATE_COURSES[0])
  for (let i = 0; i < 20; i++) stepRace(chopped, { up: true }, 0.05)
  for (let i = 0; i < 10; i++) stepRace(long, { up: true }, 0.1)
  assert.ok(Math.abs(long.elapsedMs - 1000) < 1e-6, `recorded ${long.elapsedMs}ms of 1000ms`)
  assert.equal(long.elapsedMs, chopped.elapsedMs)
  assert.equal(long.x, chopped.x)
  assert.equal(long.y, chopped.y)
  assert.equal(long.speed, chopped.speed)
})

test('a huge frame gap is clamped, not fast-forwarded', () => {
  const state = createRaceState(TEMPLATE_COURSES[0])
  stepRace(state, { up: true }, 5)
  assert.ok(Math.abs(state.elapsedMs - 250) < 1e-6)
})

test('race state carries the theme grip (default circuit = 1.0)', () => {
  const state = createRaceState(TEMPLATE_COURSES[0])
  assert.equal(state.grip, getTheme(TEMPLATE_COURSES[0].theme).grip)
})

test('lower grip reduces steering authority', () => {
  const highGrip = createRaceState({ ...TEMPLATE_COURSES[0], theme: 'circuit' })
  const lowGrip = createRaceState({ ...TEMPLATE_COURSES[0], theme: 'motocross' })
  const startHeading = highGrip.heading
  const turn = { up: true, right: true }
  for (let i = 0; i < 30; i++) {
    stepRace(highGrip, turn, 1 / 60)
    stepRace(lowGrip, turn, 1 / 60)
  }
  const highTurned = Math.abs(highGrip.heading - startHeading)
  const lowTurned = Math.abs(lowGrip.heading - startHeading)
  assert.ok(highTurned > lowTurned, `expected ${highTurned} > ${lowTurned}`)
})
