import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  getInviteShareUrl,
  inviteInternals,
  normalizeInviteCode,
} from '../src/services/inviteService.js'

const LOBBY_ID = 'a1d898d3-1c2b-4cc4-b3d6-20a74e6c1e7e'

function raceLobby(overrides = {}) {
  return {
    id: LOBBY_ID,
    code: 'ABC-234',
    status: 'open',
    isHost: true,
    expiresAt: '2026-08-12T12:00:00.000Z',
    startedAt: null,
    course: null,
    members: [{
      name: 'Racer-123ABC',
      status: 'waiting',
      finishMs: null,
      isHost: true,
      isYou: true,
    }],
    ...overrides,
  }
}

test('normalizeInviteCode accepts friendly typed invite-code forms', () => {
  assert.equal(normalizeInviteCode('abc 234'), 'ABC-234')
  assert.equal(normalizeInviteCode(' ABC-234 '), 'ABC-234')
  assert.equal(normalizeInviteCode('ABC234'), 'ABC-234')
  assert.equal(normalizeInviteCode('A1C-234'), null)
  assert.equal(normalizeInviteCode('ABC-23'), null)
})

test('getInviteShareUrl generates a HashRouter join route without browser globals', () => {
  assert.equal(getInviteShareUrl('abc234'), '#/invite?join=ABC-234')
  assert.throws(() => getInviteShareUrl('not a code'), /invalid/i)
})

test('lobby snapshots reject malformed server responses before rendering them', () => {
  assert.deepEqual(inviteInternals.assertLobbySnapshot(raceLobby()), raceLobby())
  assert.throws(
    () => inviteInternals.assertLobbySnapshot(raceLobby({ status: 'admin' })),
    /invalid state/i,
  )
  assert.throws(
    () => inviteInternals.assertLobbySnapshot(raceLobby({ members: [{ name: 'No status' }] })),
    /invalid racer/i,
  )
  assert.throws(
    () => inviteInternals.assertLobbyId('not-a-uuid'),
    /invalid/i,
  )
})

test('finish-time validation only permits whole non-negative milliseconds', () => {
  assert.doesNotThrow(() => inviteInternals.assertFinishTime(0))
  assert.doesNotThrow(() => inviteInternals.assertFinishTime(23_456))
  assert.throws(() => inviteInternals.assertFinishTime(-1), /non-negative/i)
  assert.throws(() => inviteInternals.assertFinishTime(12.5), /whole number/i)
})

test('race-lobby migration leaves SQL conditional forms unqualified', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260811000000_race_lobbies.sql', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(migration, /pg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i)
  assert.match(migration, /on conflict on constraint race_lobby_members_pkey do nothing/i)
  assert.doesNotMatch(migration, /on conflict\s*\(\s*lobby_id\s*,\s*user_id\s*\)\s*do nothing/i)
})
