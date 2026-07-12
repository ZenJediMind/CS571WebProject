// Best-run ghost recordings, one per course.
import { readKey, writeKey } from './storage'

const GHOSTS_KEY = 'ghostLaps'

export function loadGhost(courseId) {
  return readKey(GHOSTS_KEY, {})[courseId] ?? null
}

/** Persist only when this run beats the stored recording; false if the write failed. */
export function saveGhostIfBest(courseId, recording) {
  if (!recording?.samples?.length) return false
  const all = readKey(GHOSTS_KEY, {})
  const existing = all[courseId]
  if (existing && existing.ms <= recording.ms) return false
  return writeKey(GHOSTS_KEY, { ...all, [courseId]: recording })
}
