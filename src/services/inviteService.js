// Mocked multiplayer invite flow (instructor-approved): a deterministic,
// persistent invite code plus a canned lobby roster.
import { readKey, writeKey } from './storage.js'
import { hashString } from './scoreService.js'

const INVITE_CODE_KEY = 'inviteCode'
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no lookalike chars

export function getInviteCode() {
  let code = readKey(INVITE_CODE_KEY, null)
  if (!code) {
    let seed = hashString('wisconsin-racer-invite')
    const chars = Array.from({ length: 6 }, () => {
      const char = CODE_ALPHABET[seed % CODE_ALPHABET.length]
      seed = Math.imul(seed, 31) >>> 0
      return char
    })
    code = `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`
    writeKey(INVITE_CODE_KEY, code)
  }
  return code
}

export function getJoinedFriends() {
  return [
    { id: 'friend-you', name: 'You', status: 'host' },
    { id: 'friend-jane', name: 'RacerJane', status: 'ready' },
    { id: 'friend-bucky', name: 'Bucky B.', status: 'picking a car…' },
  ]
}
