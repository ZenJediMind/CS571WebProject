// Best times, points ledger, and deterministic seeded rivals (the mock
// "other players" every leaderboard and results screen compares against).
import { readKey, writeKey } from './storage'

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

export function getBestTime(courseId) {
  return readKey(BEST_TIMES_KEY, {})[courseId] ?? null
}

export function getTotalPoints() {
  return readKey(POINTS_KEY, 0)
}

/**
 * Record a finished race. Awards +10 per rival beaten and +5 for a new
 * personal best (a first time on a course counts as a new best).
 */
export function recordTime(courseId, ms) {
  const beatenRivals = getRivalTimes(courseId).filter((rival) => ms < rival.ms)
  const previousBest = getBestTime(courseId)
  const newBest = previousBest === null || ms < previousBest

  if (newBest) {
    const bestTimes = readKey(BEST_TIMES_KEY, {})
    writeKey(BEST_TIMES_KEY, { ...bestTimes, [courseId]: ms })
  }

  const pointsEarned = beatenRivals.length * POINTS_PER_RIVAL_BEATEN
    + (newBest ? POINTS_PER_NEW_BEST : 0)
  writeKey(POINTS_KEY, getTotalPoints() + pointsEarned)

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
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}
