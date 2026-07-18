// Steer-to-next-path-cell driver: throttles on straights, brakes into
// corners, reverses out when pinned. Drives rival ghosts and test runs.
import { CELL_SIZE, cellCenter } from './courseModel.js'
import { MAX_SPEED } from './engine.js'

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

export function createAutopilotCursor() {
  return { targetIdx: 1 }
}

export function autopilotInputs(state, cursor) {
  const reached = cellCenter(state.path[cursor.targetIdx])
  if (Math.hypot(reached.x - state.x, reached.y - state.y) < CELL_SIZE * 0.45) {
    cursor.targetIdx = (cursor.targetIdx + 1) % state.path.length
  }
  const target = cellCenter(state.path[cursor.targetIdx])
  const diff = normalizeAngle(Math.atan2(target.y - state.y, target.x - state.x) - state.heading)

  const stuck = Math.abs(state.speed) < 8 && Math.abs(diff) > 2.0
  if (stuck) {
    return { up: false, down: true, left: diff > 0, right: diff < 0, handbrake: false }
  }

  // Speed thresholds scale with the state's top-speed factor (rival pacing)
  const top = MAX_SPEED * (state.maxSpeedFactor ?? 1)
  const cornering = Math.abs(diff) > 0.35
  return {
    up: state.speed < top * 0.25 || (Math.abs(diff) < 1.0 && (!cornering || state.speed < top * 0.47)),
    down: cornering && state.speed > top * 0.53,
    left: diff < -0.05,
    right: diff > 0.05,
    handbrake: false,
  }
}
