// Best times, points ledger, and deterministic seeded rivals (the mock
// "other players" every leaderboard and results screen compares against).
import { readKey, readObject, writeKey } from './storage.js'

const BEST_TIMES_KEY = 'bestTimes'
const POINTS_KEY = 'points'

export const PLAYER_NAME = 'You'

const RIVALS = [
  { id: 'rival-bucky', name: 'Bucky B.', car: 'The Badger' },
  { id: 'rival-jane', name: 'RacerJane', car: 'Blue Streak' },
  { id: 'rival-cheez', name: 'CheeseWhiz', car: 'Cheese Wedge' },
  { id: 'rival-brat', name: 'Brat Zermann', car: 'Bratwagen' },
]

export const PLAYER_CAR_NAME = 'My Ride'

const POINTS_PER_RIVAL_BEATEN = 10
const POINTS_PER_NEW_BEST = 5

/** Deterministic 32-bit FNV-1a hash — the seed for all mocked rival data. */
export function hashString(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Rival lap-set times for a course: stable per (course, rival), 24–60s. */
export function getRivalTimes(courseId) {
  return RIVALS.map((rival) => ({
    ...rival,
    ms: 24000 + (hashString(`${courseId}:${rival.id}`) % 36000),
  }))
}

function readBestTimes() {
  const raw = readObject(BEST_TIMES_KEY, {})
  const times = {}
  for (const [courseId, ms] of Object.entries(raw)) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) times[courseId] = ms
  }
  return times
}

export function getBestTime(courseId) {
  return readBestTimes()[courseId] ?? null
}

export function getTotalPoints() {
  const points = readKey(POINTS_KEY, 0)
  return typeof points === 'number' && Number.isFinite(points) ? points : 0
}

/**
 * Record a finished race. Awards +10 per rival beaten and +5 for a new
 * personal best (a first time on a course counts as a new best).
 */
export function recordTime(courseId, ms) {
  const beatenRivals = getRivalTimes(courseId).filter((rival) => ms < rival.ms)
  const previousBest = getBestTime(courseId)
  const wouldBeNewBest = previousBest === null || ms < previousBest

  // Only claim a new best (and its bonus points) when the best-time write succeeds.
  let newBest = false
  if (wouldBeNewBest) {
    newBest = writeKey(BEST_TIMES_KEY, { ...readBestTimes(), [courseId]: ms })
  }

  let pointsEarned = beatenRivals.length * POINTS_PER_RIVAL_BEATEN
    + (newBest ? POINTS_PER_NEW_BEST : 0)
  // Only report points the UI can trust — a failed ledger write earns nothing.
  if (pointsEarned > 0 && !writeKey(POINTS_KEY, getTotalPoints() + pointsEarned)) {
    pointsEarned = 0
  }

  return { pointsEarned, newBest, beatenRivals, previousBest }
}

/**
 * Idempotent recordTime keyed by resultId: StrictMode remounts and page
 * refreshes replay the same award instead of double-counting points.
 */
export function recordTimeOnce(resultId, courseId, ms) {
  const guardKey = `wisconsinRacer.v1.award.${resultId}`
  try {
    const cached = sessionStorage.getItem(guardKey)
    if (cached) return JSON.parse(cached)
  } catch { /* private mode — fall through and award once per mount */ }
  const award = recordTime(courseId, ms)
  try {
    sessionStorage.setItem(guardKey, JSON.stringify(award))
  } catch { /* session guard unavailable; award still recorded */ }
  return award
}

/** Drop the stored best time for a deleted course. */
export function clearCourseBestTime(courseId) {
  const times = readBestTimes()
  if (!(courseId in times)) return true
  const { [courseId]: _removed, ...rest } = times
  return writeKey(BEST_TIMES_KEY, rest)
}

/** Rivals + the player's best (if any), sorted fastest first. */
export function getCourseLeaderboard(courseId) {
  const rows = getRivalTimes(courseId)
    .map((rival) => ({ ...rival, isPlayer: false }))
  const playerBest = getBestTime(courseId)
  if (playerBest !== null) {
    rows.push({ id: 'player', name: PLAYER_NAME, car: PLAYER_CAR_NAME, ms: playerBest, isPlayer: true })
  }
  return rows.sort((a, b) => a.ms - b.ms)
}

/** Overall points: player's earned total vs stable rival totals. */
export function getPointsRanking() {
  const rows = RIVALS.map((rival) => ({
    ...rival,
    points: 20 + (hashString(`points:${rival.id}`) % 120),
    isPlayer: false,
  }))
  rows.push({ id: 'player', name: PLAYER_NAME, car: PLAYER_CAR_NAME, points: getTotalPoints(), isPlayer: true })
  return rows.sort((a, b) => b.points - a.points)
}

/** mm:ss.t display formatting for lap-set times. */
export function formatMs(ms) {
  const totalTenths = Math.max(0, Math.round(Number(ms) / 100))
  const minutes = Math.floor(totalTenths / 600)
  const tenths = totalTenths % 600
  const seconds = (tenths / 10).toFixed(1)
  return `${minutes}:${seconds.padStart(4, '0')}`
}
