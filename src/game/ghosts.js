// Ghost cars: live autopilot rivals pace-matched to leaderboard times, and
// recording/playback of the player's best run. Pure — data is injected.
import { createRaceState, stepRace } from './engine'
import { autopilotInputs, createAutopilotCursor } from './autopilot'

const RIVAL_GHOST_COLORS = ['#17a2b8', '#7d3c98']

const GHOST_STEP_SECONDS = 1 / 60
const PACE_FACTOR_MIN = 0.4
const PACE_FACTOR_MAX = 1.1

/** courseId:theme:gridFingerprint → { naturalMs, factors: Map<targetMs, factor> } */
const rivalPaceCache = new Map()

function gridFingerprint(grid) {
  let hash = 2166136261
  for (const row of grid) {
    for (const cell of row) {
      hash ^= cell ? (cell.piece.charCodeAt(0) + cell.rotation) : 0
      hash = Math.imul(hash, 16777619) >>> 0
    }
  }
  return hash.toString(36)
}

function paceCacheKey(course) {
  return `${course.id}:${course.theme ?? ''}:${gridFingerprint(course.grid)}`
}

/** Fast-forward an autopilot run to measure its finish time on this course. */
export function simulateRunMs(course, maxSpeedFactor = 1, maxSimSeconds = 240) {
  const state = createRaceState(course, { maxSpeedFactor })
  const cursor = createAutopilotCursor()
  for (let i = 0; i < maxSimSeconds * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), GHOST_STEP_SECONDS)
  }
  return state.finished ? state.elapsedMs : null
}

const clampPace = (factor) => Math.min(PACE_FACTOR_MAX, Math.max(PACE_FACTOR_MIN, factor))

/**
 * Calibrate a top-speed factor so an autopilot run lands near targetMs.
 * Lap time is not inverse to top speed (corner time barely scales), so the
 * naive naturalMs/targetMs seed is refined with proportional corrections.
 */
function paceFactorFor(course, naturalMs, targetMs) {
  let factor = clampPace(naturalMs / targetMs)
  for (let i = 0; i < 3; i++) {
    const pacedMs = simulateRunMs(course, factor)
    if (!pacedMs || Math.abs(pacedMs - targetMs) / targetMs <= 0.05) break
    const corrected = clampPace(factor * (pacedMs / targetMs))
    if (corrected === factor) break // pinned at a clamp bound
    factor = corrected
  }
  return factor
}

function getPaceCache(course) {
  const key = paceCacheKey(course)
  let entry = rivalPaceCache.get(key)
  if (!entry) {
    entry = { naturalMs: simulateRunMs(course, 1), factors: new Map() }
    rivalPaceCache.set(key, entry)
  }
  return entry
}

/** Up to `count` fastest rivals as live-driven ghost race states. */
export function createRivalGhosts(course, rivalTimes, count = 2) {
  const cache = getPaceCache(course)
  if (!cache.naturalMs) return []
  return [...rivalTimes]
    .sort((a, b) => a.ms - b.ms)
    .slice(0, count)
    .map((rival, index) => {
      let factor = cache.factors.get(rival.ms)
      if (factor == null) {
        factor = paceFactorFor(course, cache.naturalMs, rival.ms)
        cache.factors.set(rival.ms, factor)
      }
      return {
        id: rival.id,
        name: rival.name,
        color: RIVAL_GHOST_COLORS[index % RIVAL_GHOST_COLORS.length],
        state: createRaceState(course, { maxSpeedFactor: factor }),
        cursor: createAutopilotCursor(),
        accumulator: 0,
      }
    })
}

/** Advance rival ghosts on a fixed timestep so their runs are deterministic. */
export function stepRivalGhosts(ghosts, dtSeconds) {
  for (const ghost of ghosts) {
    if (ghost.state.finished) continue
    ghost.accumulator += dtSeconds
    while (ghost.accumulator >= GHOST_STEP_SECONDS && !ghost.state.finished) {
      ghost.accumulator -= GHOST_STEP_SECONDS
      stepRace(ghost.state, autopilotInputs(ghost.state, ghost.cursor), GHOST_STEP_SECONDS)
    }
  }
}

/** Samples the player run at fixed sim-time intervals for later replay. */
export function createGhostRecorder(sampleMs = 100) {
  const samples = []
  return {
    sample(state) {
      while (state.elapsedMs >= samples.length * sampleMs) {
        samples.push([Math.round(state.x), Math.round(state.y), Math.round(state.heading * 1000)])
      }
    },
    finish(state) {
      return { ms: Math.round(state.elapsedMs), sampleMs, samples, splits: [...state.splits] }
    },
  }
}

const lerp = (a, b, t) => a + (b - a) * t

/** Interpolated ghost pose at race time, or null once the recording ends. */
export function ghostPoseAt(recording, elapsedMs) {
  if (!recording?.samples?.length || elapsedMs > recording.ms) return null
  const exact = elapsedMs / recording.sampleMs
  const index = Math.min(Math.floor(exact), recording.samples.length - 1)
  const next = Math.min(index + 1, recording.samples.length - 1)
  const a = recording.samples[index]
  const b = recording.samples[next]
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return null
  const t = exact - index
  const [x0, y0, h0] = a
  const [x1, y1, h1] = b
  // Shortest-arc heading interpolation
  const delta = Math.atan2(Math.sin((h1 - h0) / 1000), Math.cos((h1 - h0) / 1000))
  return { x: lerp(x0, x1, t), y: lerp(y0, y1, t), heading: h0 / 1000 + delta * t }
}
