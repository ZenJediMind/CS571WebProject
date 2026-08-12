-- Authenticated score submission. Supabase verifies the caller's JWT before
-- this SECURITY DEFINER function runs; identity, display name, rival points,
-- and course revision are all derived or checked by the database.
create or replace function public.submit_race_result(
  p_client_result_id text,
  p_course_id text,
  p_course_revision integer,
  p_time_ms integer,
  p_recording jsonb,
  p_lobby_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  display_name text;
  previous_best integer;
  is_new_best boolean;
  rival record;
  input_text text;
  character_position integer;
  hash_value bigint;
  rival_time_ms integer;
  beaten_rivals jsonb := '[]'::jsonb;
  beaten_player_ghosts jsonb := '[]'::jsonb;
  points_earned integer;
  lobby_course_id text;
  lobby_course_revision integer;
begin
  if current_user_id is null then
    raise exception 'Sign in before submitting a race result.';
  end if;
  if p_client_result_id is null
    or p_client_result_id <> pg_catalog.btrim(p_client_result_id)
    or pg_catalog.char_length(p_client_result_id) not between 1 and 160 then
    raise exception 'The race result ID is invalid.';
  end if;
  if p_course_id is null
    or p_course_id <> pg_catalog.btrim(p_course_id)
    or pg_catalog.char_length(p_course_id) not between 1 and 80
    or p_course_revision is null
    or p_course_revision < 1
    or p_time_ms is null
    or p_time_ms < 0
    or not public.is_race_ghost_recording(p_recording) then
    raise exception 'The race result is invalid.';
  end if;
  if abs((p_recording ->> 'ms')::numeric - p_time_ms) > 1 then
    raise exception 'The race result time does not match its recording.';
  end if;
  if not exists (
    select 1
    from public.courses as course
    where course.id = p_course_id
      and course.revision = p_course_revision
      and course.is_public = true
  ) then
    raise exception 'This course revision cannot accept race results.';
  end if;

  select profile.display_name
  into display_name
  from public.profiles as profile
  where profile.id = current_user_id;
  if display_name is null then
    raise exception 'Your racer profile is not ready. Please refresh and try again.';
  end if;

  if exists (
    select 1
    from public.race_scores as score
    where score.user_id = current_user_id
      and score.client_result_id = p_client_result_id
  ) then
    return pg_catalog.jsonb_build_object(
      'pointsEarned', 0,
      'newBest', false,
      'bestTimeSaved', true,
      'beatenRivals', '[]'::jsonb,
      'beatenPlayers', '[]'::jsonb,
      'previousBest', null,
      'alreadyRecorded', true
    );
  end if;

  if p_lobby_id is not null then
    select lobby.course_id, lobby.course_revision
    into lobby_course_id, lobby_course_revision
    from public.race_lobbies as lobby
    where lobby.id = p_lobby_id
    for share;
    if lobby_course_id is distinct from p_course_id
      or lobby_course_revision is distinct from p_course_revision
      or not exists (
        select 1
        from public.race_lobby_members as member
        where member.lobby_id = p_lobby_id
          and member.user_id = current_user_id
      ) then
      raise exception 'This result does not belong to your selected race lobby.';
    end if;

    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', ghost.racer_name,
          'ms', ghost.time_ms
        )
        order by ghost.time_ms asc, ghost.racer_name asc
      ),
      '[]'::jsonb
    )
    into beaten_player_ghosts
    from public.race_ghosts as ghost
    join public.race_lobby_members as member
      on member.lobby_id = p_lobby_id
      and member.user_id = ghost.user_id
    where member.user_id <> current_user_id
      and ghost.course_id = p_course_id
      and ghost.course_revision = p_course_revision
      and p_time_ms < ghost.time_ms;
  end if;

  select min(score.time_ms)
  into previous_best
  from public.race_scores as score
  where score.user_id = current_user_id
    and score.course_id = p_course_id
    and score.course_revision = p_course_revision;
  is_new_best := previous_best is null or p_time_ms < previous_best;

  for rival in
    select *
    from (values
      ('rival-bucky', 'Bucky B.'),
      ('rival-jane', 'RacerJane'),
      ('rival-cheez', 'CheeseWhiz'),
      ('rival-brat', 'Brat Zermann')
    ) as simulated_rival(id, name)
  loop
    input_text := p_course_id || ':' || rival.id;
    hash_value := 2166136261;
    for character_position in 1..pg_catalog.char_length(input_text) loop
      hash_value := hash_value # pg_catalog.ascii(
        pg_catalog.substr(input_text, character_position, 1)
      )::bigint;
      hash_value := pg_catalog.mod(hash_value * 16777619::bigint, 4294967296::bigint);
    end loop;
    rival_time_ms := 24000 + pg_catalog.mod(hash_value, 36000)::integer;
    if p_time_ms < rival_time_ms then
      beaten_rivals := beaten_rivals || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', rival.id,
          'name', rival.name,
          'ms', rival_time_ms
        )
      );
    end if;
  end loop;

  points_earned := pg_catalog.jsonb_array_length(beaten_rivals) * 10
    + case when is_new_best then 5 else 0 end;
  insert into public.race_scores (
    course_id, course_revision, user_id, racer_name, time_ms,
    points_earned, client_result_id
  )
  values (
    p_course_id, p_course_revision, current_user_id, display_name, p_time_ms,
    points_earned, p_client_result_id
  );

  return pg_catalog.jsonb_build_object(
    'pointsEarned', points_earned,
    'newBest', is_new_best,
    'bestTimeSaved', true,
    'beatenRivals', beaten_rivals,
    'beatenPlayers', beaten_player_ghosts,
    'previousBest', previous_best,
    'alreadyRecorded', false
  );
end;
$function$;

-- The old client insert policy and privilege allowed a modified browser to
-- choose its own racer name, points, or time. Read access remains public for
-- the existing leaderboard views; writes now go only through the RPC above.
drop policy if exists "Users submit current-course scores" on public.race_scores;
revoke insert on table public.race_scores from public, anon, authenticated;

revoke all on function public.submit_race_result(text, text, integer, integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_race_result(text, text, integer, integer, jsonb, uuid)
  to authenticated;
