import { ensureRacerSession } from './authService.js'
import { profileAsync } from './performanceService.js'
import { readKey, writeKey } from './storage.js'
import { requireSupabase } from './supabaseClient.js'

const ACTIVE_LOBBY_KEY = 'activeRaceLobbyId'
const LOBBY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INVITE_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/
const LOBBY_STATUSES = new Set(['open', 'racing', 'ended'])
const MEMBER_STATUSES = new Set(['waiting', 'racing', 'finished'])

function isLobbyId(value) {
  return typeof value === 'string' && LOBBY_ID_PATTERN.test(value)
}

/** Makes a hand-typed code consistent with the database's code format. */
export function normalizeInviteCode(value) {
  const compactCode = String(value ?? '')
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, '')
  if (compactCode.length !== 6) return null

  const normalizedCode = `${compactCode.slice(0, 3)}-${compactCode.slice(3)}`
  return INVITE_CODE_PATTERN.test(normalizedCode) ? normalizedCode : null
}

function assertLobbySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('The race lobby returned an invalid response.')
  }
  if (!isLobbyId(snapshot.id) || !INVITE_CODE_PATTERN.test(snapshot.code)) {
    throw new Error('The race lobby returned an invalid identity.')
  }
  if (!LOBBY_STATUSES.has(snapshot.status) || !Array.isArray(snapshot.members)) {
    throw new Error('The race lobby returned an invalid state.')
  }
  if (typeof snapshot.isHost !== 'boolean') {
    throw new Error('The race lobby returned an invalid role.')
  }
  if (snapshot.course !== null && (!snapshot.course || typeof snapshot.course !== 'object')) {
    throw new Error('The race lobby returned an invalid course.')
  }

  for (const member of snapshot.members) {
    if (!member || typeof member.name !== 'string' || !MEMBER_STATUSES.has(member.status)
      || typeof member.isHost !== 'boolean' || typeof member.isYou !== 'boolean') {
      throw new Error('The race lobby returned an invalid racer.')
    }
    const validFinish = member.finishMs === null
      || (Number.isInteger(member.finishMs) && member.finishMs >= 0)
    if (!validFinish) {
      throw new Error('The race lobby returned an invalid racer.')
    }
  }

  if (snapshot.course !== null) {
    const { course } = snapshot
    if (typeof course.id !== 'string' || typeof course.name !== 'string'
      || !Number.isInteger(course.revision) || course.revision < 1
      || !Array.isArray(course.grid) || typeof course.theme !== 'string') {
      throw new Error('The race lobby returned an invalid course.')
    }
  }
  return snapshot
}

function rememberLobby(snapshot) {
  writeKey(ACTIVE_LOBBY_KEY, snapshot.id)
  return snapshot
}

async function callLobbyRpc(operation, rpcName, argumentsByName = {}) {
  return profileAsync(`backend.lobbies.${operation}`, async () => {
    await ensureRacerSession()
    const { data, error } = await requireSupabase().rpc(rpcName, argumentsByName)
    if (error) throw new Error(error.message || 'The race lobby request failed.')
    return data
  })
}

function assertFinishTime(finishMs) {
  if (!Number.isInteger(finishMs) || finishMs < 0) {
    throw new Error('Race time must be a non-negative whole number of milliseconds.')
  }
}

function assertLobbyId(lobbyId) {
  if (!isLobbyId(lobbyId)) throw new Error('The race lobby ID is invalid.')
}

export function getActiveRaceLobbyId() {
  const lobbyId = readKey(ACTIVE_LOBBY_KEY, null)
  return isLobbyId(lobbyId) ? lobbyId : null
}

export function clearActiveRaceLobby() {
  writeKey(ACTIVE_LOBBY_KEY, null)
}

export function getInviteShareUrl(code) {
  const normalizedCode = normalizeInviteCode(code)
  if (!normalizedCode) throw new Error('The race invite code is invalid.')

  const route = `#/invite?join=${encodeURIComponent(normalizedCode)}`
  if (typeof window === 'undefined') return route
  return `${window.location.href.split('#')[0]}${route}`
}

export async function createRaceLobby() {
  const snapshot = assertLobbySnapshot(await callLobbyRpc('create', 'create_race_lobby'))
  return rememberLobby(snapshot)
}

export async function joinRaceLobby(code) {
  const normalizedCode = normalizeInviteCode(code)
  if (!normalizedCode) throw new Error('Enter a valid six-character race code.')
  const snapshot = assertLobbySnapshot(await callLobbyRpc('join', 'join_race_lobby', {
    p_join_code: normalizedCode,
  }))
  return rememberLobby(snapshot)
}

export async function getRaceLobby(lobbyId) {
  assertLobbyId(lobbyId)
  return assertLobbySnapshot(await callLobbyRpc('get', 'get_race_lobby', {
    p_lobby_id: lobbyId,
  }))
}

export async function selectRaceLobbyCourse(lobbyId, courseId) {
  assertLobbyId(lobbyId)
  if (typeof courseId !== 'string' || courseId.trim().length === 0) {
    throw new Error('Choose a course for the race night.')
  }
  return assertLobbySnapshot(await callLobbyRpc('select_course', 'select_race_lobby_course', {
    p_lobby_id: lobbyId,
    p_course_id: courseId.trim(),
  }))
}

export async function startRaceLobby(lobbyId) {
  assertLobbyId(lobbyId)
  return assertLobbySnapshot(await callLobbyRpc('start', 'start_race_lobby', {
    p_lobby_id: lobbyId,
  }))
}

export async function recordRaceLobbyFinish(lobbyId, finishMs) {
  assertLobbyId(lobbyId)
  assertFinishTime(finishMs)
  return assertLobbySnapshot(await callLobbyRpc('finish', 'record_race_lobby_finish', {
    p_lobby_id: lobbyId,
    p_finish_ms: finishMs,
  }))
}

export async function leaveRaceLobby(lobbyId) {
  assertLobbyId(lobbyId)
  const didLeave = await callLobbyRpc('leave', 'leave_race_lobby', { p_lobby_id: lobbyId })
  if (didLeave !== true) throw new Error('Could not leave the race lobby.')
  clearActiveRaceLobby()
}

export async function endRaceLobby(lobbyId) {
  assertLobbyId(lobbyId)
  const snapshot = assertLobbySnapshot(await callLobbyRpc('end', 'end_race_lobby', {
    p_lobby_id: lobbyId,
  }))
  clearActiveRaceLobby()
  return snapshot
}

export const inviteInternals = {
  assertFinishTime,
  assertLobbyId,
  assertLobbySnapshot,
  isLobbyId,
}
