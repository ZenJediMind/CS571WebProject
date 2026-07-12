import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { CELL_SIZE, PIECES, createEmptyGrid } = await loadGameModule('courseModel')
const { TEMPLATE_COURSES } = await loadGameModule('templates')
const { createRaceState, stepRace } = await loadGameModule('engine')

// Long straight corridor rows 1..8 at col 5 turned into a loop is overkill —
// use Mad Town GP (has oil + ramp on the loop) plus a synthetic strip where
// piece behavior is isolated.
function stripCourse(specialPiece, specialRow) {
  // Vertical loop: col 3 runs N-S rows 1..8, col 6 returns, curves join them.
  // START rotation 180 lists its south edge first, so derivePath (and the
  // spawn heading) walks DOWN the col-3 straight toward the special cell.
  const grid = createEmptyGrid()
  const put = (row, col, piece, rotation) => { grid[row][col] = { piece, rotation } }
  put(1, 3, PIECES.CURVE, 90); put(1, 4, PIECES.STRAIGHT, 90); put(1, 5, PIECES.STRAIGHT, 90); put(1, 6, PIECES.CURVE, 180)
  for (let row = 2; row <= 7; row++) { put(row, 3, PIECES.STRAIGHT, 0); put(row, 6, PIECES.STRAIGHT, 0) }
  put(8, 3, PIECES.CURVE, 0); put(8, 4, PIECES.STRAIGHT, 90); put(8, 5, PIECES.STRAIGHT, 90); put(8, 6, PIECES.CURVE, 270)
  put(2, 3, PIECES.START, 180)
  if (specialPiece) put(specialRow, 3, specialPiece, 0)
  return { id: 'test-strip', name: 'Strip', grid }
}

function press(state, inputs, frames) {
  for (let i = 0; i < frames; i++) stepRace(state, inputs, 1 / 60)
}

/** Full-throttle frames until the predicate holds; -1 if it never does. */
function driveUntil(state, predicate, maxFrames = 600) {
  for (let frame = 1; frame <= maxFrames; frame++) {
    stepRace(state, { up: true }, 1 / 60)
    if (predicate(state)) return frame
  }
  return -1
}

test('handbrake tightens the turn', () => {
  const plain = createRaceState(stripCourse())
  const drift = createRaceState(stripCourse())
  press(plain, { up: true }, 55) // full speed, mid-straight around row 4
  press(drift, { up: true }, 55)
  const headingBefore = plain.heading
  press(plain, { right: true }, 20)
  press(drift, { right: true, handbrake: true }, 20)
  assert.ok(
    Math.abs(drift.heading - headingBefore) > Math.abs(plain.heading - headingBefore) * 1.3,
    'handbrake must rotate noticeably faster',
  )
})

test('oil kills steering authority', () => {
  const onRoad = createRaceState(stripCourse())
  const onOil = createRaceState(stripCourse(PIECES.OIL, 5))
  const framesToSlick = driveUntil(onOil, (state) => state.onOil)
  assert.ok(framesToSlick > 0, 'car reaches the slick')
  press(onRoad, { up: true }, framesToSlick) // identical run up to the slick
  const roadHeading = onRoad.heading
  const oilHeading = onOil.heading
  press(onRoad, { right: true }, 10)
  press(onOil, { right: true }, 10) // short enough to stay on the slick cell
  assert.ok(onOil.onOil, 'car must be on the slick')
  assert.ok(
    Math.abs(onOil.heading - oilHeading) < Math.abs(onRoad.heading - roadHeading) * 0.5,
    'steering on oil must be far weaker',
  )
})

test('a car stopped on oil can throttle off the slick', () => {
  const state = createRaceState(stripCourse(PIECES.OIL, 5))
  // Approach gently — a full-speed stop overshoots the 64px slick cell
  let reached = false
  for (let i = 0; i < 600 && !(reached = state.onOil); i++) {
    stepRace(state, { up: state.speed < 150 }, 1 / 60)
  }
  assert.ok(reached, 'car reaches the slick')
  for (let i = 0; i < 300 && state.speed > 0; i++) stepRace(state, { down: true }, 1 / 60)
  press(state, {}, 30) // settle to a dead stop
  assert.ok(state.onOil, 'car must be stranded on the slick')
  assert.equal(state.speed, 0)
  const escaped = driveUntil(state, (s) => !s.onOil)
  assert.ok(escaped > 0, 'throttle must crawl the car off the oil')
})

test('ramp launches airborne and lands back on track', () => {
  const state = createRaceState(stripCourse(PIECES.RAMP, 5))
  const launched = driveUntil(state, (s) => s.airborneMs > 0)
  assert.ok(launched > 0, 'ramp at speed must launch the car')
  const landed = driveUntil(state, (s) => s.airborneMs === 0)
  assert.ok(landed > 0, 'flight must end')
  press(state, { up: true }, 120)
  assert.equal(state.airborneMs, 0)
  const col = Math.floor(state.x / CELL_SIZE)
  assert.ok([3, 4, 5, 6].includes(col), 'car must end up on/near the loop')
})

test('splits record at checkpoints and boostCount increments on Mad Town', async () => {
  const { createAutopilotCursor, autopilotInputs } = await loadGameModule('autopilot')
  const madTown = TEMPLATE_COURSES.find((c) => c.id === 'tpl-mad-town-gp')
  const state = createRaceState(madTown)
  const cursor = createAutopilotCursor()
  for (let i = 0; i < 180 * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
  }
  assert.equal(state.finished, true, 'autopilot survives oil + ramp on the loop')
  assert.ok(state.boostCount >= 1, 'boost pads counted')
  const expectedSplits = (state.checkpoints.length + 1) * state.totalLaps
  assert.equal(state.splits.length, expectedSplits)
  for (let i = 1; i < state.splits.length; i++) {
    assert.ok(state.splits[i] > state.splits[i - 1], 'splits strictly increase')
  }
})
