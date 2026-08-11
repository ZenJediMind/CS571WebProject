import { ensureRacerSession } from './authService.js'
import { profileAsync } from './performanceService.js'
import { requireSupabase } from './supabaseClient.js'

const RIVALS = [
  { id: 'rival-bucky', name: 'Bucky B.', car: 'The Badger' },
  { id: 'rival-jane', name: 'RacerJane', car: 'Blue Streak' },
  { id: 'rival-cheez', name: 'CheeseWhiz', car: 'Cheese Wedge' },
  { id: 'rival-brat', name: 'Brat Zermann', car: 'Bratwagen' },
]

export const PLAYER_CAR_NAME = 'My Ride'
const POINTS_PER_RIVAL_BEATEN = 10
const POINTS_PER_NEW_BEST = 5
const pendingAwards = new Map()
const completedAwards = new Map()
const MAX_COMPLETED_AWARDS = 250

/** Deterministic 32-bit FNV-1a hash - the seed for simulated rival data. */
export function hashString(str) {
  let hash = 0x811c9dc5
  for (let index = 0; index < str.length; index++) {
    hash ^= str.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Rival lap-set times for a course: stable per (course, rival), 24-60s. */
export function getRivalTimes(courseId) {
  return RIVALS.map((rival) => ({
    ...rival,
    ms: 24000 + (hashString(`${courseId}:${rival.id}`) % 36000),
  }))
}

function assertRaceInput(resultId, courseId, courseRevision, ms) {
  if (typeof resultId !== 'string' || resultId.trim().length === 0) {
    throw new Error('This race result has no stable result ID.')
  }
  if (typeof courseId !== 'string' || courseId.trim().length === 0) {
    throw new Error('This race result has no course ID.')
  }
  if (!Number.isInteger(courseRevision) || courseRevision < 1) {
    throw new Error('This race result has an invalid course revision.')
  }
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > 2_147_483_647) {
    throw new Error('This race result has an invalid time.')
  }
}

function raceAwardCacheKey(resultId) {
  return `wisconsinRacer.v2.award.${resultId}`
}

function readCachedAward(resultId) {
  try {
    const raw = sessionStorage.getItem(raceAwardCacheKey(resultId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function cacheAward(resultId, award) {
  if (completedAwards.size >= MAX_COMPLETED_AWARDS) {
    completedAwards.delete(completedAwards.keys().next().value)
  }
  completedAwards.set(resultId, award)
  try {
    sessionStorage.setItem(raceAwardCacheKey(resultId), JSON.stringify(award))
  } catch {
    // The database uniqueness constraint remains the durable idempotency guard.
  }
}

async function getPreviousBest(client, racerName, courseId, courseRevision) {
  const { data, error } = await client
    .from('race_score_leaderboard')
    .select('time_ms')
    .eq('course_id', courseId)
    .eq('course_revision', courseRevision)
    .eq('racer_name', racerName)
    .order('time_ms', { ascending: true })
    .limit(1)
  if (error) throw new Error(`Could not read your previous best time: ${error.message}`)
  return data[0]?.time_ms ?? null
}

/**
 * Writes one result to Supabase. The table's (user_id, client_result_id)
 * constraint is the final guard against duplicate points when a page remounts.
 */
export async function recordTime(resultId, courseId, courseRevision, ms) {
  assertRaceInput(resultId, courseId, courseRevision, ms)

  return profileAsync('backend.scores.record', async () => {
    const [client, racer] = [requireSupabase(), await ensureRacerSession()]
    const previousBest = await getPreviousBest(
      client,
      racer.displayName,
      courseId,
      courseRevision,
    )
    const beatenRivals = getRivalTimes(courseId).filter((rival) => ms < rival.ms)
    const newBest = previousBest === null || ms < previousBest
    const pointsEarned = beatenRivals.length * POINTS_PER_RIVAL_BEATEN
      + (newBest ? POINTS_PER_NEW_BEST : 0)

    const { error } = await client
      .from('race_scores')
      .insert({
        course_id: courseId,
        course_revision: courseRevision,
        user_id: racer.id,
        racer_name: racer.displayName,
        time_ms: Math.round(ms),
        points_earned: pointsEarned,
        client_result_id: resultId,
      })

    if (error?.code === '23505') {
      return {
        pointsEarned: 0,
        newBest: false,
        bestTimeSaved: true,
        beatenRivals: [],
        previousBest,
        alreadyRecorded: true,
      }
    }
    if (error) throw new Error(`Could not save your race result: ${error.message}`)

    return {
      pointsEarned,
      newBest,
      bestTimeSaved: true,
      beatenRivals,
      previousBest,
      alreadyRecorded: false,
    }
  })
}

/** Idempotent across React remounts and ordinary result-page refreshes. */
export async function recordTimeOnce(resultId, courseId, courseRevision, ms) {
  const completed = completedAwards.get(resultId)
  if (completed) return completed
  const cached = readCachedAward(resultId)
  if (cached) {
    cacheAward(resultId, cached)
    return cached
  }
  if (pendingAwards.has(resultId)) return pendingAwards.get(resultId)

  const pending = recordTime(resultId, courseId, courseRevision, ms)
    .then((award) => {
      cacheAward(resultId, award)
      return award
    })
    .finally(() => pendingAwards.delete(resultId))
  pendingAwards.set(resultId, pending)
  return pending
}

function bestByRacer(rows) {
  const byRacer = new Map()
  for (const row of rows) {
    const current = byRacer.get(row.racer_name)
    if (!current || row.time_ms < current.time_ms) byRacer.set(row.racer_name, row)
  }
  return [...byRacer.values()]
}

/** Shared Supabase scores plus deterministic racers used by the game itself. */
export async function getCourseLeaderboard(courseId, courseRevision, racerName) {
  if (typeof courseId !== 'string' || !Number.isInteger(courseRevision)) return []

  return profileAsync('backend.scores.course_leaderboard', async () => {
    const client = requireSupabase()
    const { data, error } = await client
      .from('race_score_leaderboard')
      .select('racer_name, time_ms, created_at')
      .eq('course_id', courseId)
      .eq('course_revision', courseRevision)
      .order('time_ms', { ascending: true })
    if (error) throw new Error(`Could not load the course leaderboard: ${error.message}`)

    const rivals = getRivalTimes(courseId).map((rival) => ({ ...rival, isPlayer: false }))
    const communityRows = bestByRacer(data).map((row) => ({
      id: `score-${row.racer_name}-${row.created_at}`,
      name: row.racer_name,
      car: 'Community Racer',
      ms: row.time_ms,
      isPlayer: row.racer_name === racerName,
    }))
    return [...rivals, ...communityRows].sort((left, right) => left.ms - right.ms)
  })
}

/** Shared Supabase points plus deterministic racers used by the game itself. */
export async function getPointsRanking(racerName) {
  return profileAsync('backend.scores.points_leaderboard', async () => {
    const client = requireSupabase()
    const { data, error } = await client
      .from('racer_points_leaderboard')
      .select('racer_name, points')
      .order('points', { ascending: false })
    if (error) throw new Error(`Could not load the points leaderboard: ${error.message}`)

    const rivals = RIVALS.map((rival) => ({
      ...rival,
      points: 20 + (hashString(`points:${rival.id}`) % 120),
      isPlayer: false,
    }))
    const communityRows = data.map((row) => ({
      id: `points-${row.racer_name}`,
      name: row.racer_name,
      car: 'Community Racer',
      points: Number(row.points),
      isPlayer: row.racer_name === racerName,
    }))
    return [...rivals, ...communityRows].sort((left, right) => right.points - left.points)
  })
}

/** mm:ss.t display formatting for lap-set times. */
export function formatMs(ms) {
  const totalTenths = Math.max(0, Math.round(Number(ms) / 100))
  const minutes = Math.floor(totalTenths / 600)
  const tenths = totalTenths % 600
  const seconds = (tenths / 10).toFixed(1)
  return `${minutes}:${seconds.padStart(4, '0')}`
}

export const scoreInternals = { assertRaceInput, bestByRacer }
