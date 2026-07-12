// Pure race simulation. No DOM, no timers — state advances only through
// stepRace(state, inputs, dtSeconds), so identical inputs replay identically.
import { CELL_SIZE, PIECES, derivePath, isTrackCell } from './courseModel'

export const TOTAL_LAPS = 3
export const MAX_SPEED = 320 // px/s
const ACCELERATION = 380 // px/s²
const BRAKE_DECELERATION = 560
const COAST_FRICTION = 200
const REVERSE_MAX_SPEED = -90
const TURN_RATE = 4.4 // rad/s at full turn effectiveness
const BOOST_KICK = 140 // px/s added when entering a boost pad
const BOOST_DECAY = 55 // px/s² bleed-off while over MAX_SPEED
const PIT_MAX_SPEED = MAX_SPEED * 0.55
const OBSTACLE_BOUNCE_FACTOR = -0.5
const WALL_BOUNCE_FACTOR = -0.25
const MAX_STEP_SECONDS = 0.05 // clamp long frames so physics stays stable
const MAX_FRAME_SECONDS = 0.25 // longer gaps (tab switch, debugger) are a stall, not race time
const CHECKPOINT_SPACING = 4 // every 4th path cell is a checkpoint

const HANDBRAKE_MIN_SPEED = 90 // px/s needed before the rear kicks out
const HANDBRAKE_TURN_MULTIPLIER = 1.6
const HANDBRAKE_SCRUB = 240 // px/s² extra speed loss while drifting
const OIL_STEER_FACTOR = 0.25
const OIL_FRICTION_FACTOR = 0.3
const RAMP_MIN_SPEED = MAX_SPEED * 0.4
const AIRBORNE_BASE_MS = 500

const cellKey = (row, col) => `${row}:${col}`
const cellCenter = ({ row, col }) => ({
  x: (col + 0.5) * CELL_SIZE,
  y: (row + 0.5) * CELL_SIZE,
})

export function createRaceState(course, { maxSpeedFactor = 1 } = {}) {
  const path = derivePath(course.grid)
  if (!path) throw new Error(`Course ${course.id} has no drivable loop.`)

  const checkpoints = path
    .filter((_, index) => index > 0 && index % CHECKPOINT_SPACING === 0)
    .map((cell) => ({ ...cell, key: cellKey(cell.row, cell.col) }))

  const startCenter = cellCenter(path[0])
  const secondCenter = cellCenter(path[1])

  return {
    grid: course.grid,
    path,
    checkpoints,
    nextCheckpoint: 0,
    startKey: cellKey(path[0].row, path[0].col),
    x: startCenter.x,
    y: startCenter.y,
    heading: Math.atan2(secondCenter.y - startCenter.y, secondCenter.x - startCenter.x),
    speed: 0,
    lap: 0, // completed laps; display lap = lap + 1 while racing
    totalLaps: TOTAL_LAPS,
    elapsedMs: 0,
    finished: false,
    currentCellKey: cellKey(path[0].row, path[0].col),
    maxSpeedFactor,
    airborneMs: 0,
    lastSafe: { x: startCenter.x, y: startCenter.y },
    boostCount: 0,
    splits: [],
    drifting: false,
    onOil: false,
  }
}

function applyThrottle(state, inputs, dt) {
  const topSpeed = MAX_SPEED * state.maxSpeedFactor
  if (inputs.up && !state.onOil) {
    if (state.speed > topSpeed) {
      // Boost pads push past top speed; the surplus bleeds off gradually
      state.speed = Math.max(state.speed - BOOST_DECAY * dt, topSpeed)
    } else {
      state.speed = Math.min(state.speed + ACCELERATION * dt, topSpeed)
    }
  } else if (inputs.down) {
    state.speed = Math.max(state.speed - BRAKE_DECELERATION * dt, REVERSE_MAX_SPEED)
  } else {
    // Oil carries speed: throttle is dead and friction drops way off
    const friction = COAST_FRICTION * (state.onOil ? OIL_FRICTION_FACTOR : 1)
    if (state.speed > 0) state.speed = Math.max(state.speed - friction * dt, 0)
    else if (state.speed < 0) state.speed = Math.min(state.speed + friction * dt, 0)
  }
  if (state.drifting) {
    state.speed = Math.max(state.speed - HANDBRAKE_SCRUB * dt, 0)
  }
}

function applySteering(state, inputs, dt) {
  state.drifting = Boolean(inputs.handbrake) && Math.abs(state.speed) > HANDBRAKE_MIN_SPEED
  const speedRatio = Math.min(Math.abs(state.speed) / (MAX_SPEED * 0.45), 1)
  if (speedRatio === 0) return
  const direction = (inputs.left ? -1 : 0) + (inputs.right ? 1 : 0)
  const reverseFactor = state.speed < 0 ? -1 : 1
  const authority = (state.onOil ? OIL_STEER_FACTOR : 1)
    * (state.drifting ? HANDBRAKE_TURN_MULTIPLIER : 1)
  state.heading += direction * reverseFactor * TURN_RATE * authority * speedRatio * dt
}

function gridCellAt(x, y) {
  return { row: Math.floor(y / CELL_SIZE), col: Math.floor(x / CELL_SIZE) }
}

function pieceAt(grid, row, col) {
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return null
  return grid[row][col]?.piece ?? null
}

/** Try full move, then axis-aligned slides, so the car skims along walls. */
function moveWithCollisions(state, dt) {
  const dx = Math.cos(state.heading) * state.speed * dt
  const dy = Math.sin(state.heading) * state.speed * dt

  const attempts = [
    { x: state.x + dx, y: state.y + dy },
    { x: state.x + dx, y: state.y },
    { x: state.x, y: state.y + dy },
  ]

  for (const attempt of attempts) {
    const { row, col } = gridCellAt(attempt.x, attempt.y)
    if (isTrackCell(state.grid, row, col)) {
      state.lastSafe.x = attempt.x
      state.lastSafe.y = attempt.y
      const slid = attempt !== attempts[0]
      if (slid) state.speed *= 0.9
      state.x = attempt.x
      state.y = attempt.y
      return
    }
  }

  // Fully blocked: bounce off, harder from obstacles than from grass
  const { row, col } = gridCellAt(state.x + dx, state.y + dy)
  const bounce = pieceAt(state.grid, row, col) === PIECES.OBSTACLE
    ? OBSTACLE_BOUNCE_FACTOR
    : WALL_BOUNCE_FACTOR
  state.speed *= bounce
}

function applyCellEffects(state) {
  const { row, col } = gridCellAt(state.x, state.y)
  const piece = pieceAt(state.grid, row, col)
  state.onOil = piece === PIECES.OIL
  const key = cellKey(row, col)
  const enteredNewCell = key !== state.currentCellKey
  state.currentCellKey = key

  if (piece === PIECES.BOOST && enteredNewCell) {
    state.speed = Math.min(MAX_SPEED * state.maxSpeedFactor * 1.25, state.speed + BOOST_KICK)
    state.boostCount += 1
  }
  if (piece === PIECES.PIT) {
    state.speed = Math.min(state.speed, PIT_MAX_SPEED)
  }
  if (piece === PIECES.RAMP && enteredNewCell && Math.abs(state.speed) >= RAMP_MIN_SPEED) {
    const speedRatio = Math.min(Math.max(Math.abs(state.speed) / MAX_SPEED, 0.5), 1.25)
    state.airborneMs = AIRBORNE_BASE_MS * speedRatio
  }

  if (!enteredNewCell) return

  const target = state.checkpoints[state.nextCheckpoint]
  if (target && key === target.key) {
    state.nextCheckpoint += 1
    state.splits.push(state.elapsedMs)
  } else if (key === state.startKey && state.nextCheckpoint === state.checkpoints.length) {
    state.splits.push(state.elapsedMs)
    state.lap += 1
    state.nextCheckpoint = 0
    if (state.lap >= state.totalLaps) state.finished = true
  }
}

function landCar(state) {
  state.airborneMs = 0
  const { row, col } = gridCellAt(state.x, state.y)
  if (!isTrackCell(state.grid, row, col)) {
    // Missed the landing: back to the last on-track spot at half speed
    state.x = state.lastSafe.x
    state.y = state.lastSafe.y
    state.speed *= 0.5
  }
}

function advanceSubstep(state, inputs, dt) {
  state.elapsedMs += dt * 1000

  if (state.airborneMs > 0) {
    // Flying: no control, no cell effects, sails over non-track cells
    state.airborneMs -= dt * 1000
    state.x += Math.cos(state.heading) * state.speed * dt
    state.y += Math.sin(state.heading) * state.speed * dt
    state.drifting = false
    if (state.airborneMs <= 0) landCar(state)
    return
  }

  applyThrottle(state, inputs, dt)
  applySteering(state, inputs, dt)
  moveWithCollisions(state, dt)
  applyCellEffects(state)
}

export function stepRace(state, inputs, dtSeconds) {
  if (state.finished) return state
  // Keep real elapsed time but integrate physics in short, stable substeps
  let remaining = Math.min(dtSeconds, MAX_FRAME_SECONDS)
  while (remaining > 0 && !state.finished) {
    const dt = Math.min(remaining, MAX_STEP_SECONDS)
    remaining -= dt
    advanceSubstep(state, inputs, dt)
  }
  return state
}
