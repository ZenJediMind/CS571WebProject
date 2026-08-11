import { profileAsync } from './performanceService.js'
import { requireSupabase } from './supabaseClient.js'

const DEFAULT_RACER_NAME = 'Racer'

let racerPromise = null

function createGuestName(seed = crypto.randomUUID()) {
  const suffix = seed.replaceAll('-', '').slice(-6).toUpperCase()
  return `Racer-${suffix}`
}

function normalizeDisplayName(value) {
  const name = String(value ?? '').trim()
  if (name.length < 1 || name.length > 80) {
    throw new Error('Racer name must contain between 1 and 80 characters.')
  }
  return name
}

async function loadProfile(client, userId) {
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(`Could not load your racer profile: ${error.message}`)
  if (!data) throw new Error('Your Supabase profile was not created. Please refresh and try again.')
  return data
}

/** Creates or restores the anonymous Supabase identity used for all writes. */
export function ensureRacerSession() {
  if (!racerPromise) {
    racerPromise = profileAsync('backend.auth.session', async () => {
      const client = requireSupabase()
      const { data: sessionData, error: sessionError } = await client.auth.getSession()
      if (sessionError) throw new Error(`Could not restore your racer session: ${sessionError.message}`)

      let user = sessionData.session?.user
      if (!user) {
        const { data, error } = await client.auth.signInAnonymously({
          options: { data: { display_name: createGuestName() } },
        })
        if (error) {
          throw new Error(
            `Could not start a guest racer session: ${error.message}`,
          )
        }
        user = data.user
      }

      if (!user) throw new Error('Supabase did not return a racer identity.')
      let profile = await loadProfile(client, user.id)
      if (profile.display_name === DEFAULT_RACER_NAME) {
        const displayName = createGuestName(user.id)
        const { data, error } = await client
          .from('profiles')
          .update({ display_name: displayName })
          .eq('id', user.id)
          .select('id, display_name')
          .single()
        if (error) throw new Error(`Could not initialize your racer name: ${error.message}`)
        profile = data
      }

      return {
        id: user.id,
        isAnonymous: Boolean(user.is_anonymous),
        displayName: profile.display_name,
      }
    })
  }
  return racerPromise
}

export async function renameRacer(displayName) {
  const racer = await ensureRacerSession()
  const client = requireSupabase()
  const name = normalizeDisplayName(displayName)
  const { data, error } = await profileAsync('backend.profile.rename', () => (
    client
      .from('profiles')
      .update({ display_name: name })
      .eq('id', racer.id)
      .select('id, display_name')
      .single()
  ))
  if (error) throw new Error(`Could not update your racer name: ${error.message}`)

  racerPromise = Promise.resolve({ ...racer, displayName: data.display_name })
  return racerPromise
}

export function resetRacerSessionCache() {
  racerPromise = null
}
