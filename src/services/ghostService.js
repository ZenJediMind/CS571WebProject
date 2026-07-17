// Best-run ghost recordings, one per course.
import { readObject, writeKey } from './storage'

const GHOSTS_KEY = 'ghostLaps'

function isValidSample(sample) {
  return Array.isArray(sample)
    && sample.length >= 3
    && sample.slice(0, 3).every((value) => typeof value === 'number' && Number.isFinite(value))
}

function isValidGhost(recording) {
  return recording
    && typeof recording.ms === 'number'
    && Number.isFinite(recording.ms)
    && typeof recording.sampleMs === 'number'
    && recording.sampleMs > 0
    && Array.isArray(recording.samples)
    && recording.samples.length > 0
    && recording.samples.every(isValidSample)
    && Array.isArray(recording.splits ?? [])
}

function readGhosts() {
  const all = readObject(GHOSTS_KEY, {})
  const valid = {}
  for (const [courseId, recording] of Object.entries(all)) {
    if (isValidGhost(recording)) valid[courseId] = recording
  }
  return valid
}

export function loadGhost(courseId) {
  return readGhosts()[courseId] ?? null
}

/** Persist only when this run beats the stored recording; false if the write failed. */
export function saveGhostIfBest(courseId, recording) {
  if (!isValidGhost(recording)) return false
  const all = readGhosts()
  const existing = all[courseId]
  if (existing && existing.ms <= recording.ms) return false
  return writeKey(GHOSTS_KEY, { ...all, [courseId]: recording })
}

/** Drop the stored ghost for a deleted course. */
export function clearCourseGhost(courseId) {
  const all = readGhosts()
  if (!(courseId in all)) return true
  const { [courseId]: _removed, ...rest } = all
  return writeKey(GHOSTS_KEY, rest)
}
