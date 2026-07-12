// Pure race simulation. No DOM, no timers — state advances only through
// stepRace(state, inputs, dtSeconds), so identical inputs replay identically.
import { CELL_SIZE, PIECES, derivePath, isTrackCell } from './courseModel'

export const TOTAL_LAPS = 3
export const MAX_SPEED = 320 // px/s
const BOOSTED_MAX_SPEED = MAX_SPEED * 1.25
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
const CHECKPOINT_SPACING = 4 // every 4th path cell is a checkpoint

const cellKey = (row, col) => `${row}:${col}`
const cellCenter = ({ row, col }) => ({
  x: (col + 0.5) * CELL_SIZE,
  y: (row + 0.5) * CELL_SIZE,
})

export function createRaceState(course) {
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
  }
}

function applyThrottle(state, inputs, dt) {
  if (inputs.up) {
    if (state.speed > MAX_SPEED) {
      // Boost pads push past MAX_SPEED; the surplus bleeds off gradually
      state.speed = Math.max(state.speed - BOOST_DECAY * dt, MAX_SPEED)
    } else {
      state.speed = Math.min(state.speed + ACCELERATION * dt, MAX_SPEED)
    }
  } else if (inputs.down) {
    state.speed = Math.max(state.speed - BRAKE_DECELERATION * dt, REVERSE_MAX_SPEED)
  } else if (state.speed > 0) {
    state.speed = Math.max(state.speed - COAST_FRICTION * dt, 0)
  } else if (state.speed < 0) {
    state.speed = Math.min(state.speed + COAST_FRICTION * dt, 0)
  }
}

function applySteering(state, inputs, dt) {
  const speedRatio = Math.min(Math.abs(state.speed) / (MAX_SPEED * 0.45), 1)
  if (speedRatio === 0) return
  const direction = (inputs.left ? -1 : 0) + (inputs.right ? 1 : 0)
  // Steering flips in reverse, like a real car backing up
  const reverseFactor = state.speed < 0 ? -1 : 1
  state.heading += direction * reverseFactor * TURN_RATE * speedRatio * dt
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
  const key = cellKey(row, col)
  const enteredNewCell = key !== state.currentCellKey
  state.currentCellKey = key

  if (piece === PIECES.BOOST && enteredNewCell) {
    state.speed = Math.min(BOOSTED_MAX_SPEED, state.speed + BOOST_KICK)
  }
  if (piece === PIECES.PIT) {
    state.speed = Math.min(state.speed, PIT_MAX_SPEED)
  }

  if (!enteredNewCell) return

  const target = state.checkpoints[state.nextCheckpoint]
  if (target && key === target.key) {
    state.nextCheckpoint += 1
  } else if (key === state.startKey && state.nextCheckpoint === state.checkpoints.length) {
    state.lap += 1
    state.nextCheckpoint = 0
    if (state.lap >= state.totalLaps) state.finished = true
  }
}

export function stepRace(state, inputs, dtSeconds) {
  if (state.finished) return state
  const dt = Math.min(dtSeconds, MAX_STEP_SECONDS)

  state.elapsedMs += dt * 1000
  applyThrottle(state, inputs, dt)
  applySteering(state, inputs, dt)
  moveWithCollisions(state, dt)
  applyCellEffects(state)
  return state
}
