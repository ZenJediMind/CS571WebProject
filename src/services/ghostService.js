// Fastest device-local ghost recordings, one per course, plus bounded shared
// best runs from Supabase for on-track opponent playback.
import { ensureRacerSession } from './authService.js'
import { profileAsync } from './performanceService.js'
import { readObject, writeKey } from './storage.js'
import { requireSupabase } from './supabaseClient.js'

const GHOSTS_KEY = 'ghostLaps'

function isValidSample(sample) {
  return Array.isArray(sample)
    && sample.length >= 3
    && sample.slice(0, 3).every((value) => typeof value === 'number' && Number.isFinite(value))
}

export function isValidGhostRecording(recording) {
  const validShape = recording
    && typeof recording.ms === 'number'
    && Number.isFinite(recording.ms) && recording.ms >= 0
    && typeof recording.sampleMs === 'number'
    && Number.isFinite(recording.sampleMs)
    && recording.sampleMs >= 25 && recording.sampleMs <= 1000
    && Array.isArray(recording.samples)
    && recording.samples.length > 0 && recording.samples.length <= 10000
    && recording.samples.every(isValidSample)
    && Array.isArray(recording.splits ?? [])
    && recording.splits.length <= 1000
    && recording.splits.every((value) => Number.isFinite(value) && value >= 0)
  if (!validShape) return false

  const maximumSampleDistance = recording.sampleMs * 0.45 + 3
  const samplesCoverRun = (recording.samples.length - 1) * recording.sampleMs <= recording.ms
    && recording.ms <= recording.samples.length * recording.sampleMs
  return samplesCoverRun && recording.samples.every((sample, index) => {
    if (index === 0) return true
    const previous = recording.samples[index - 1]
    return Math.hypot(sample[0] - previous[0], sample[1] - previous[1]) <= maximumSampleDistance
  })
}

function readGhosts() {
  const all = readObject(GHOSTS_KEY, {})
  const valid = {}
  for (const [courseId, recording] of Object.entries(all)) {
    if (isValidGhostRecording(recording)) valid[courseId] = recording
  }
  return valid
}

export function loadGhost(courseId) {
  return readGhosts()[courseId] ?? null
}

/**
 * Persist only when this run beats the local replay. The shared backend owns
 * the official leaderboard, while this small cache keeps replay rendering
 * instant and avoids uploading large frame-by-frame recordings.
 */
export function saveGhostIfFaster(courseId, recording) {
  if (!isValidGhostRecording(recording)) return false
  const all = readGhosts()
  const existing = all[courseId]
  if (existing && existing.ms <= recording.ms) return true
  return writeKey(GHOSTS_KEY, { ...all, [courseId]: recording })
}

/** Drop the stored ghost for a deleted course. */
export function clearCourseGhost(courseId) {
  const all = readGhosts()
  if (!(courseId in all)) return true
  const { [courseId]: _removed, ...rest } = all
  return writeKey(GHOSTS_KEY, rest)
}

function assertGhostCourse(courseId, courseRevision) {
  if (typeof courseId !== 'string' || courseId.trim().length === 0) {
    throw new Error('A shared ghost needs a valid course ID.')
  }
  if (!Number.isInteger(courseRevision) || courseRevision < 1) {
    throw new Error('A shared ghost needs a valid course revision.')
  }
}

function mapSharedGhost(row, index) {
  if (!row || typeof row.racer_name !== 'string' || !Number.isInteger(row.time_ms)
    || row.time_ms < 0 || !isValidGhostRecording(row.recording)) {
    return null
  }
  return {
    id: `ghost-${index}-${row.racer_name}`,
    name: row.racer_name,
    ms: row.time_ms,
    recording: row.recording,
  }
}

/** Loads other members' saved ghosts for the selected Race Night course. */
export async function loadRaceLobbyGhosts(lobbyId, courseId, courseRevision, limit = 2) {
  assertGhostCourse(courseId, courseRevision)
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 4)) : 2
  if (typeof lobbyId !== 'string' || lobbyId.trim().length === 0) {
    throw new Error('A shared ghost needs a valid race lobby ID.')
  }

  return profileAsync('backend.ghosts.load', async () => {
    await ensureRacerSession()
    const { data, error } = await requireSupabase().rpc('get_race_lobby_ghosts', {
      p_lobby_id: lobbyId,
    })
    if (error) throw new Error(`Could not load shared race ghosts: ${error.message}`)
    if (!Array.isArray(data)) throw new Error('The shared ghost service returned an invalid response.')

    const ghosts = data.map(mapSharedGhost)
    if (ghosts.some((ghost) => ghost === null)) {
      throw new Error('The shared ghost service returned an invalid recording.')
    }
    if (data.some((row) => row.course_id !== courseId || row.course_revision !== courseRevision)) {
      throw new Error('The shared ghost service returned a ghost for another course.')
    }
    return ghosts.slice(0, safeLimit)
  })
}

/** Saves only an improved shared ghost; the database makes the comparison atomic. */
export async function saveSharedGhostIfFaster(courseId, courseRevision, recording) {
  assertGhostCourse(courseId, courseRevision)
  if (!isValidGhostRecording(recording)) throw new Error('This ghost recording is invalid.')

  return profileAsync('backend.ghosts.save', async () => {
    await ensureRacerSession()
    const { data, error } = await requireSupabase().rpc('save_race_ghost', {
      p_course_id: courseId,
      p_course_revision: courseRevision,
      p_time_ms: Math.round(recording.ms),
      p_recording: recording,
    })
    if (error) throw new Error(`Could not save your shared ghost: ${error.message}`)
    return data === true
  })
}

export const ghostInternals = { mapSharedGhost }
