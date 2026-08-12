-- Shared best-run ghost recordings. A ghost is tied to an immutable course
-- revision so replay coordinates never get used on an edited layout.

create or replace function public.is_race_ghost_recording(p_recording jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select case
    when p_recording is null then false
    when pg_catalog.jsonb_typeof(p_recording) <> 'object' then false
    when pg_catalog.jsonb_typeof(p_recording -> 'ms') <> 'number' then false
    when pg_catalog.jsonb_typeof(p_recording -> 'sampleMs') <> 'number' then false
    when pg_catalog.jsonb_typeof(p_recording -> 'samples') <> 'array' then false
    when pg_catalog.jsonb_typeof(p_recording -> 'splits') <> 'array' then false
    when (p_recording ->> 'ms')::numeric < 0
      or (p_recording ->> 'ms')::numeric > 2147483647 then false
    when (p_recording ->> 'sampleMs')::numeric < 25
      or (p_recording ->> 'sampleMs')::numeric > 1000 then false
    when pg_catalog.jsonb_array_length(p_recording -> 'samples') < 1
      or pg_catalog.jsonb_array_length(p_recording -> 'samples') > 10000 then false
    when (pg_catalog.jsonb_array_length(p_recording -> 'samples') - 1)
      * (p_recording ->> 'sampleMs')::numeric > (p_recording ->> 'ms')::numeric
      or (p_recording ->> 'ms')::numeric > pg_catalog.jsonb_array_length(p_recording -> 'samples')
      * (p_recording ->> 'sampleMs')::numeric then false
    when pg_catalog.jsonb_array_length(p_recording -> 'splits') > 1000 then false
    when exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_recording -> 'samples') as sample(value)
      where pg_catalog.jsonb_typeof(sample.value) <> 'array'
        or pg_catalog.jsonb_array_length(sample.value) <> 3
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(sample.value) as coordinate(value)
          where pg_catalog.jsonb_typeof(coordinate.value) <> 'number'
            or (coordinate.value #>> '{}')::numeric < -10000
            or (coordinate.value #>> '{}')::numeric > 10000
        )
    ) then false
    -- The game cannot cover more than 400 px/s (including a boost). Leave a
    -- small rounding margin, while rejecting replay samples that teleport.
    when exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_recording -> 'samples')
        with ordinality as sample(value, sample_index)
      join pg_catalog.jsonb_array_elements(p_recording -> 'samples')
        with ordinality as previous(value, sample_index)
        on previous.sample_index + 1 = sample.sample_index
      where (
        ((sample.value ->> 0)::numeric - (previous.value ->> 0)::numeric)
          * ((sample.value ->> 0)::numeric - (previous.value ->> 0)::numeric)
        + ((sample.value ->> 1)::numeric - (previous.value ->> 1)::numeric)
          * ((sample.value ->> 1)::numeric - (previous.value ->> 1)::numeric)
      ) > (
        (p_recording ->> 'sampleMs')::numeric * 0.45 + 3
      ) * (
        (p_recording ->> 'sampleMs')::numeric * 0.45 + 3
      )
    ) then false
    when exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_recording -> 'splits') as split(value)
      where pg_catalog.jsonb_typeof(split.value) <> 'number'
        or (split.value #>> '{}')::numeric < 0
        or (split.value #>> '{}')::numeric > 2147483647
    ) then false
    else true
  end;
$function$;

create table if not exists public.race_ghosts (
  course_id text not null references public.courses(id) on delete cascade,
  course_revision integer not null check (course_revision > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  racer_name text not null
    check (racer_name = btrim(racer_name) and char_length(racer_name) between 1 and 80),
  time_ms integer not null check (time_ms >= 0),
  recording jsonb not null check (public.is_race_ghost_recording(recording)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, course_revision, user_id),
  check (abs((recording ->> 'ms')::numeric - time_ms) <= 1)
);

create index if not exists race_ghosts_course_revision_time_idx
  on public.race_ghosts (course_id, course_revision, time_ms asc);

-- Atomically retain a racer's fastest recording for a course revision. The
-- browser can never pick a different racer name or overwrite another user.
create or replace function public.save_race_ghost(
  p_course_id text,
  p_course_revision integer,
  p_time_ms integer,
  p_recording jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  display_name text;
  saved boolean := false;
begin
  if current_user_id is null then
    raise exception 'Sign in before saving a shared ghost.';
  end if;
  if p_time_ms < 0 or not public.is_race_ghost_recording(p_recording) then
    raise exception 'The race ghost recording is invalid.';
  end if;
  if abs((p_recording ->> 'ms')::numeric - p_time_ms) > 1 then
    raise exception 'The race ghost time does not match its recording.';
  end if;
  if not exists (
    select 1
    from public.courses as course
    where course.id = pg_catalog.btrim(p_course_id)
      and course.revision = p_course_revision
      and course.is_public = true
  ) then
    raise exception 'This course revision cannot accept a shared ghost.';
  end if;

  select profile.display_name
  into display_name
  from public.profiles as profile
  where profile.id = current_user_id;
  if display_name is null then
    raise exception 'Your racer profile is not ready. Please refresh and try again.';
  end if;

  insert into public.race_ghosts (
    course_id, course_revision, user_id, racer_name, time_ms, recording
  )
  values (
    pg_catalog.btrim(p_course_id), p_course_revision, current_user_id,
    display_name, p_time_ms, p_recording
  )
  on conflict on constraint race_ghosts_pkey do update
  set racer_name = excluded.racer_name,
      time_ms = excluded.time_ms,
      recording = excluded.recording,
      updated_at = pg_catalog.now()
  where excluded.time_ms < public.race_ghosts.time_ms
  returning true into saved;

  return coalesce(saved, false);
end;
$function$;

alter table public.race_ghosts enable row level security;

-- Ghost recordings are intentionally available only to signed-in members of
-- the same Race Night lobby. In particular, do not expose user IDs or raw
-- replay coordinates through a broadly-readable view.
create or replace function public.get_race_lobby_ghosts(p_lobby_id uuid)
returns table (
  course_id text,
  course_revision integer,
  racer_name text,
  time_ms integer,
  recording jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  selected_course_id text;
  selected_course_revision integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before loading race ghosts.';
  end if;

  select lobby.course_id, lobby.course_revision
  into selected_course_id, selected_course_revision
  from public.race_lobbies as lobby
  where lobby.id = p_lobby_id
  for share;
  if selected_course_id is null then
    raise exception 'This race lobby has no selected course.';
  end if;
  if not exists (
    select 1
    from public.race_lobby_members as member
    where member.lobby_id = p_lobby_id
      and member.user_id = current_user_id
  ) then
    raise exception 'You have not joined this race lobby.';
  end if;

  return query
  select
    ghost.course_id,
    ghost.course_revision,
    ghost.racer_name,
    ghost.time_ms,
    ghost.recording
  from public.race_ghosts as ghost
  join public.race_lobby_members as member
    on member.lobby_id = p_lobby_id
    and member.user_id = ghost.user_id
  where member.user_id <> current_user_id
    and ghost.course_id = selected_course_id
    and ghost.course_revision = selected_course_revision
  order by ghost.time_ms asc, ghost.racer_name asc;
end;
$function$;

revoke all on table public.race_ghosts from public, anon, authenticated;

revoke all on function public.save_race_ghost(text, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_race_ghost(text, integer, integer, jsonb)
  to authenticated;
revoke all on function public.get_race_lobby_ghosts(uuid) from public, anon, authenticated;
grant execute on function public.get_race_lobby_ghosts(uuid) to authenticated;
