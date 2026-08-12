-- Shared race-night lobbies.
--
-- Invite codes are only a convenient way to find a lobby. Every read and
-- mutation still goes through a SECURITY DEFINER function that checks the
-- anonymous Supabase user's membership or host identity.

create table if not exists public.race_lobbies (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique
    check (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'racing', 'ended')),
  -- The selected course is snapshotted below, so a later source-course delete
  -- must not erase an in-progress race night or violate this row's invariant.
  course_id text,
  course_revision integer check (course_revision > 0),
  course_name text check (course_name = btrim(course_name) and char_length(course_name) between 1 and 120),
  course_grid jsonb check (course_grid is null or public.is_course_grid_shape(course_grid)),
  course_theme text check (course_theme in ('circuit', 'rally', 'desert', 'motocross', 'night')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (
    (course_id is null and course_revision is null and course_name is null
      and course_grid is null and course_theme is null)
    or
    (course_id is not null and course_revision is not null and course_name is not null
      and course_grid is not null and course_theme is not null)
  )
);

create table if not exists public.race_lobby_members (
  lobby_id uuid not null references public.race_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  racer_name text not null
    check (racer_name = btrim(racer_name) and char_length(racer_name) between 1 and 80),
  status text not null default 'waiting' check (status in ('waiting', 'racing', 'finished')),
  finish_ms integer check (finish_ms >= 0),
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id),
  check ((status = 'finished') = (finish_ms is not null))
);

create index if not exists race_lobbies_open_expires_idx
  on public.race_lobbies (status, expires_at);

create index if not exists race_lobby_members_lobby_joined_idx
  on public.race_lobby_members (lobby_id, joined_at);

-- The code is a lobby locator, not an authorization credential: membership
-- and host identity are checked by every RPC below.
create or replace function public.generate_race_lobby_code()
returns text
language plpgsql
volatile
set search_path = ''
as $function$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
begin
  for index_value in 0..5 loop
    code := code || pg_catalog.substr(
      alphabet,
      pg_catalog.floor(pg_catalog.random() * pg_catalog.length(alphabet))::integer + 1,
      1
    );
  end loop;
  return pg_catalog.substr(code, 1, 3) || '-' || pg_catalog.substr(code, 4, 3);
end;
$function$;

-- This helper is deliberately not granted to browser roles. Public wrappers
-- verify membership before exposing the snapshot.
create or replace function public.race_lobby_snapshot(p_lobby_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'id', lobby.id,
    'code', lobby.join_code,
    'status', lobby.status,
    'isHost', lobby.host_id = auth.uid(),
    'expiresAt', lobby.expires_at,
    'startedAt', lobby.started_at,
    'course', case when lobby.course_id is null then null else pg_catalog.jsonb_build_object(
      'id', lobby.course_id,
      'revision', lobby.course_revision,
      'name', lobby.course_name,
      'grid', lobby.course_grid,
      'theme', lobby.course_theme
    ) end,
    'members', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', member.racer_name,
          'status', member.status,
          'finishMs', member.finish_ms,
          'isHost', member.user_id = lobby.host_id,
          'isYou', member.user_id = auth.uid()
        )
        order by member.joined_at
      )
      from public.race_lobby_members as member
      where member.lobby_id = lobby.id
    ), '[]'::jsonb)
  )
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id;
$function$;

create or replace function public.create_race_lobby()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  display_name text;
  lobby_id uuid;
  generated_code text;
begin
  if current_user_id is null then
    raise exception 'Sign in before creating a race lobby.';
  end if;

  select profile.display_name
  into display_name
  from public.profiles as profile
  where profile.id = current_user_id;
  if display_name is null then
    raise exception 'Your racer profile is not ready. Please refresh and try again.';
  end if;

  for attempt in 1..8 loop
    generated_code := public.generate_race_lobby_code();
    begin
      insert into public.race_lobbies (join_code, host_id)
      values (generated_code, current_user_id)
      returning id into lobby_id;
      exit;
    exception when unique_violation then
      -- A six-character code collision is rare; generate another instead of
      -- surfacing a transient database conflict to the host.
      null;
    end;
  end loop;

  if lobby_id is null then
    raise exception 'Could not allocate a unique race lobby code. Please try again.';
  end if;

  insert into public.race_lobby_members (lobby_id, user_id, racer_name)
  values (lobby_id, current_user_id, display_name);

  return public.race_lobby_snapshot(lobby_id);
end;
$function$;

create or replace function public.join_race_lobby(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  compact_code text := pg_catalog.regexp_replace(
    pg_catalog.upper(pg_catalog.btrim(coalesce(p_join_code, ''))),
    '[^A-Z0-9]',
    '',
    'g'
  );
  normalized_code text;
  lobby_id uuid;
  lobby_status text;
  lobby_expires_at timestamptz;
  display_name text;
begin
  if current_user_id is null then
    raise exception 'Sign in before joining a race lobby.';
  end if;
  if compact_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'Enter a valid six-character race code.';
  end if;

  normalized_code := pg_catalog.substr(compact_code, 1, 3)
    || '-' || pg_catalog.substr(compact_code, 4, 3);
  select lobby.id, lobby.status, lobby.expires_at
  into lobby_id, lobby_status, lobby_expires_at
  from public.race_lobbies as lobby
  where lobby.join_code = normalized_code
  for update;

  if lobby_id is null then
    raise exception 'That race code was not found.';
  end if;
  if lobby_status <> 'open' or lobby_expires_at <= pg_catalog.now() then
    raise exception 'That race lobby is no longer accepting racers.';
  end if;

  select profile.display_name
  into display_name
  from public.profiles as profile
  where profile.id = current_user_id;
  if display_name is null then
    raise exception 'Your racer profile is not ready. Please refresh and try again.';
  end if;

  insert into public.race_lobby_members (lobby_id, user_id, racer_name)
  values (lobby_id, current_user_id, display_name)
  on conflict on constraint race_lobby_members_pkey do nothing;

  return public.race_lobby_snapshot(lobby_id);
end;
$function$;

create or replace function public.get_race_lobby(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in before opening a race lobby.';
  end if;
  if not exists (
    select 1
    from public.race_lobby_members as member
    where member.lobby_id = p_lobby_id and member.user_id = current_user_id
  ) then
    raise exception 'Race lobby not found or you have not joined it.';
  end if;
  return public.race_lobby_snapshot(p_lobby_id);
end;
$function$;

create or replace function public.select_race_lobby_course(
  p_lobby_id uuid,
  p_course_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  lobby_host_id uuid;
  lobby_status text;
  lobby_expires_at timestamptz;
  selected_course public.courses%rowtype;
begin
  if current_user_id is null then
    raise exception 'Sign in before selecting a race course.';
  end if;

  select lobby.host_id, lobby.status, lobby.expires_at
  into lobby_host_id, lobby_status, lobby_expires_at
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id
  for update;
  if lobby_host_id is null or lobby_host_id <> current_user_id then
    raise exception 'Only the race host can select the course.';
  end if;
  if lobby_status <> 'open' or lobby_expires_at <= pg_catalog.now() then
    raise exception 'This race lobby can no longer change courses.';
  end if;

  select course.*
  into selected_course
  from public.courses as course
  where course.id = pg_catalog.btrim(p_course_id)
    and course.is_public = true;
  if selected_course.id is null then
    raise exception 'Choose a public course for the race night.';
  end if;

  update public.race_lobbies
  set course_id = selected_course.id,
      course_revision = selected_course.revision,
      course_name = selected_course.name,
      course_grid = selected_course.grid,
      course_theme = selected_course.theme
  where id = p_lobby_id;

  return public.race_lobby_snapshot(p_lobby_id);
end;
$function$;

create or replace function public.start_race_lobby(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  lobby_host_id uuid;
  lobby_status text;
  lobby_course_id text;
  lobby_expires_at timestamptz;
  member_count integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before starting a race lobby.';
  end if;

  select lobby.host_id, lobby.status, lobby.course_id, lobby.expires_at
  into lobby_host_id, lobby_status, lobby_course_id, lobby_expires_at
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id
  for update;
  if lobby_host_id is null or lobby_host_id <> current_user_id then
    raise exception 'Only the race host can start the race.';
  end if;
  if lobby_status <> 'open' or lobby_expires_at <= pg_catalog.now() then
    raise exception 'This race lobby can no longer be started.';
  end if;
  if lobby_course_id is null then
    raise exception 'Choose a course before starting the race.';
  end if;

  select pg_catalog.count(*)::integer
  into member_count
  from public.race_lobby_members as member
  where member.lobby_id = p_lobby_id;
  if member_count < 2 then
    raise exception 'At least one friend must join before the race can start.';
  end if;

  update public.race_lobby_members
  set status = 'racing', finish_ms = null
  where lobby_id = p_lobby_id;
  update public.race_lobbies
  set status = 'racing', started_at = pg_catalog.now()
  where id = p_lobby_id;

  return public.race_lobby_snapshot(p_lobby_id);
end;
$function$;

create or replace function public.record_race_lobby_finish(
  p_lobby_id uuid,
  p_finish_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  lobby_status text;
  member_status text;
  existing_finish_ms integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before recording a race result.';
  end if;
  if p_finish_ms < 0 then
    raise exception 'Race time must be zero or greater.';
  end if;

  select lobby.status
  into lobby_status
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id;
  if lobby_status <> 'racing' then
    raise exception 'This race lobby is not accepting finish times.';
  end if;

  select member.status, member.finish_ms
  into member_status, existing_finish_ms
  from public.race_lobby_members as member
  where member.lobby_id = p_lobby_id and member.user_id = current_user_id
  for update;
  if member_status is null then
    raise exception 'You have not joined this race lobby.';
  end if;
  if member_status = 'finished' then
    if existing_finish_ms <> p_finish_ms then
      raise exception 'This lobby already has your submitted finish time.';
    end if;
    return public.race_lobby_snapshot(p_lobby_id);
  end if;

  update public.race_lobby_members
  set status = 'finished', finish_ms = p_finish_ms
  where lobby_id = p_lobby_id and user_id = current_user_id;

  return public.race_lobby_snapshot(p_lobby_id);
end;
$function$;

create or replace function public.leave_race_lobby(p_lobby_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  lobby_host_id uuid;
  lobby_status text;
begin
  if current_user_id is null then
    raise exception 'Sign in before leaving a race lobby.';
  end if;

  select lobby.host_id, lobby.status
  into lobby_host_id, lobby_status
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id
  for update;
  if lobby_host_id is null then
    raise exception 'Race lobby not found.';
  end if;
  if lobby_host_id = current_user_id then
    raise exception 'The host must end the race lobby instead of leaving it.';
  end if;
  if lobby_status <> 'open' then
    raise exception 'This race has already started and cannot be left.';
  end if;

  delete from public.race_lobby_members
  where lobby_id = p_lobby_id and user_id = current_user_id;
  if not found then
    raise exception 'You have not joined this race lobby.';
  end if;
  return true;
end;
$function$;

create or replace function public.end_race_lobby(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  lobby_host_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before ending a race lobby.';
  end if;

  select lobby.host_id
  into lobby_host_id
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id
  for update;
  if lobby_host_id is null or lobby_host_id <> current_user_id then
    raise exception 'Only the race host can end this lobby.';
  end if;

  update public.race_lobbies
  set status = 'ended', ended_at = pg_catalog.now()
  where id = p_lobby_id;
  return public.race_lobby_snapshot(p_lobby_id);
end;
$function$;

alter table public.race_lobbies enable row level security;
alter table public.race_lobby_members enable row level security;

-- Browser clients never read or mutate lobby tables directly. The RPCs above
-- enforce membership, role, status, and course-publicity checks together.
revoke all on table public.race_lobbies from public, anon, authenticated;
revoke all on table public.race_lobby_members from public, anon, authenticated;

revoke all on function public.generate_race_lobby_code() from public, anon, authenticated;
revoke all on function public.race_lobby_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.create_race_lobby() from public, anon, authenticated;
revoke all on function public.join_race_lobby(text) from public, anon, authenticated;
revoke all on function public.get_race_lobby(uuid) from public, anon, authenticated;
revoke all on function public.select_race_lobby_course(uuid, text) from public, anon, authenticated;
revoke all on function public.start_race_lobby(uuid) from public, anon, authenticated;
revoke all on function public.record_race_lobby_finish(uuid, integer) from public, anon, authenticated;
revoke all on function public.leave_race_lobby(uuid) from public, anon, authenticated;
revoke all on function public.end_race_lobby(uuid) from public, anon, authenticated;

grant execute on function public.create_race_lobby() to authenticated;
grant execute on function public.join_race_lobby(text) to authenticated;
grant execute on function public.get_race_lobby(uuid) to authenticated;
grant execute on function public.select_race_lobby_course(uuid, text) to authenticated;
grant execute on function public.start_race_lobby(uuid) to authenticated;
grant execute on function public.record_race_lobby_finish(uuid, integer) to authenticated;
grant execute on function public.leave_race_lobby(uuid) to authenticated;
grant execute on function public.end_race_lobby(uuid) to authenticated;
