import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function migration(name) {
  return readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

test('shared ghosts stay behind authenticated lobby membership', async () => {
  const sql = await migration('20260811010000_shared_race_ghosts.sql')
  assert.match(sql, /create or replace function public\.get_race_lobby_ghosts\(p_lobby_id uuid\)/i)
  assert.match(sql, /member\.user_id = current_user_id/i)
  assert.match(sql, /revoke all on table public\.race_ghosts/i)
  assert.match(sql, /when p_recording is null then false/i)
  assert.doesNotMatch(sql, /limit 4/i)
  assert.doesNotMatch(sql, /race_ghost_leaderboard/i)
  assert.doesNotMatch(sql, /pg_catalog\.coalesce\s*\(/i)
})

test('leave migration supports host handoff and every member state', async () => {
  const sql = await migration('20260811020000_race_lobby_leave.sql')
  assert.match(sql, /next_host_id/i)
  assert.match(sql, /lobby_status <> 'ended'/i)
  assert.match(sql, /set host_id = next_host_id/i)
  assert.match(sql, /delete from public\.race_lobby_members/i)
})

test('score migration revokes browser inserts and uses the authenticated RPC', async () => {
  const sql = await migration('20260811030000_secure_race_submissions.sql')
  assert.match(sql, /create or replace function public\.submit_race_result/i)
  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/i)
  assert.match(sql, /drop policy if exists "Users submit current-course scores"/i)
  assert.match(sql, /revoke insert on table public\.race_scores/i)
  assert.match(sql, /grant execute on function public\.submit_race_result/i)
  assert.doesNotMatch(sql, /pg_catalog\.coalesce\s*\(/i)
})

test('browser score service submits only through the server RPC', async () => {
  const source = await readFile(
    new URL('../src/services/scoreService.js', import.meta.url),
    'utf8',
  )
  assert.match(source, /\.rpc\('submit_race_result'/)
  assert.doesNotMatch(source, /\.from\('race_scores'\)\s*\.insert\(/)
})
