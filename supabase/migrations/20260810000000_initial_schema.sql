-- Wisconsin Racer shared backend foundation.
--
-- Run this once on a fresh Supabase project. The first authenticated app
-- session seeds the source-controlled built-in templates so their shared
-- scores satisfy this schema's course foreign key. User-created courses,
-- votes, and race results live in Supabase.

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated;

-- A small public profile record lets course ownership stay tied to auth.users
-- without making email addresses part of the public course data.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Racer'
    check (display_name = btrim(display_name)
      and char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the database boundary aligned with the course model in
-- src/game/courseModel.js: 10 rows by 16 columns, null cells, and oriented
-- pieces. Connectivity/closed-loop validation still belongs in the app or a
-- trusted server function because it is game logic rather than row shape.
create or replace function public.is_course_grid_shape(p_grid jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select case
    when pg_catalog.jsonb_typeof(p_grid) <> 'array' then false
    when pg_catalog.jsonb_array_length(p_grid) <> 10 then false
    else not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_grid) as row_value(value)
      where case
        when pg_catalog.jsonb_typeof(row_value.value) <> 'array' then true
        when pg_catalog.jsonb_array_length(row_value.value) <> 16 then true
        else exists (
          select 1
          from pg_catalog.jsonb_array_elements(row_value.value) as cell(value)
          where pg_catalog.jsonb_typeof(cell.value) <> 'null'
            and (
              pg_catalog.jsonb_typeof(cell.value) <> 'object'
              or not (
                pg_catalog.jsonb_exists(cell.value, 'piece')
                and pg_catalog.jsonb_exists(cell.value, 'rotation')
                and pg_catalog.jsonb_typeof(cell.value -> 'piece') = 'string'
                and cell.value ->> 'piece' in (
                  'straight', 'curve', 's_bend', 'start', 'boost',
                  'obstacle', 'pit', 'oil', 'ramp'
                )
                and pg_catalog.jsonb_typeof(cell.value -> 'rotation') = 'number'
                and cell.value ->> 'rotation' in ('0', '90', '180', '270')
              )
            )
        )
      end
    )
  end;
$function$;

create table if not exists public.courses (
  id text primary key
    check (id = btrim(id) and char_length(id) between 1 and 80),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Racer'
    check (author_name = btrim(author_name)
      and char_length(author_name) between 1 and 80),
  name text not null
    check (name = btrim(name) and char_length(name) between 1 and 120),
  grid jsonb not null check (public.is_course_grid_shape(grid)),
  theme text not null default 'circuit'
    check (theme in ('circuit', 'rally', 'desert', 'motocross', 'night')),
  is_public boolean not null default true,
  -- Race results record this value. A layout/theme edit increments it so old
  -- results cannot be mistaken for results on the new course version.
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_votes (
  course_id text not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table if not exists public.race_scores (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  course_revision integer not null default 1 check (course_revision > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  racer_name text not null
    check (racer_name = btrim(racer_name)
      and char_length(racer_name) between 1 and 80),
  time_ms integer not null check (time_ms >= 0),
  points_earned integer not null default 0 check (points_earned >= 0),
  client_result_id text not null
    check (client_result_id = btrim(client_result_id)
      and char_length(client_result_id) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (user_id, client_result_id)
);

create index if not exists courses_public_updated_idx
  on public.courses (is_public, updated_at desc);

create index if not exists course_votes_course_idx
  on public.course_votes (course_id);

create index if not exists race_scores_course_revision_time_idx
  on public.race_scores (course_id, course_revision, time_ms asc);

create index if not exists race_scores_user_points_idx
  on public.race_scores (user_id, points_earned desc);

-- New auth users receive a profile without exposing a service key to React.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(
        pg_catalog.split_part(coalesce(new.email, ''), '@', 1)
      ), ''),
      'Racer'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep owner metadata and revision server-controlled. The client supplies the
-- course content, but cannot rename the owner or preserve an old revision.
create or replace function public.set_course_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  owner_name text;
begin
  select p.display_name
  into owner_name
  from public.profiles as p
  where p.id = new.author_id;

  new.author_name = coalesce(owner_name, 'Racer');
  new.updated_at = pg_catalog.now();

  if tg_op = 'UPDATE' then
    new.revision = old.revision + case
      when new.grid is distinct from old.grid
        or new.theme is distinct from old.theme
      then 1
      else 0
    end;
  end if;

  return new;
end;
$function$;

drop trigger if exists courses_set_metadata on public.courses;
create trigger courses_set_metadata
before insert or update on public.courses
for each row execute function public.set_course_metadata();

-- Public read policies still allow the static frontend to browse courses and
-- leaderboards. Writes remain authenticated and owner-scoped.
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_votes enable row level security;
alter table public.race_scores enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Public courses are readable" on public.courses;
create policy "Public courses are readable"
on public.courses for select
to anon, authenticated
using (is_public = true or (select auth.uid()) = author_id);

drop policy if exists "Users create their own courses" on public.courses;
create policy "Users create their own courses"
on public.courses for insert
to authenticated
with check ((select auth.uid()) = author_id);

drop policy if exists "Users update their own courses" on public.courses;
create policy "Users update their own courses"
on public.courses for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

drop policy if exists "Users delete their own courses" on public.courses;
create policy "Users delete their own courses"
on public.courses for delete
to authenticated
using ((select auth.uid()) = author_id);

drop policy if exists "Vote course counts are readable" on public.course_votes;
create policy "Vote course counts are readable"
on public.course_votes for select
to anon, authenticated
using (true);

drop policy if exists "Users vote on visible courses" on public.course_votes;
create policy "Users vote on visible courses"
on public.course_votes for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.courses as c
    where c.id = course_id
      and c.is_public = true
  )
);

drop policy if exists "Users remove their own vote" on public.course_votes;
create policy "Users remove their own vote"
on public.course_votes for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Scores are publicly readable" on public.race_scores;
create policy "Scores are publicly readable"
on public.race_scores for select
to anon, authenticated
using (true);

drop policy if exists "Users submit current-course scores" on public.race_scores;
create policy "Users submit current-course scores"
on public.race_scores for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.courses as c
    where c.id = course_id
      and c.revision = course_revision
      and c.is_public = true
  )
);

-- These projections deliberately omit user_id, author_id, database row IDs,
-- and client_result_id from public leaderboard responses.
create or replace view public.course_vote_counts
with (security_invoker = true)
as
select course_id, count(*)::integer as votes
from public.course_votes
group by course_id;

create or replace view public.course_catalog
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.author_name as author,
  c.grid,
  c.theme,
  c.is_public,
  c.revision,
  c.created_at,
  c.updated_at,
  coalesce(v.votes, 0) as votes
from public.courses as c
left join public.course_vote_counts as v on v.course_id = c.id;

create or replace view public.race_score_leaderboard
with (security_invoker = true)
as
select
  s.course_id,
  s.course_revision,
  s.racer_name,
  s.time_ms,
  s.points_earned,
  s.created_at
from public.race_scores as s
join public.courses as c
  on c.id = s.course_id
  and c.is_public = true
  and c.revision = s.course_revision;

create or replace view public.racer_points_leaderboard
with (security_invoker = true)
as
select s.racer_name, sum(s.points_earned)::integer as points
from public.race_scores as s
join public.courses as c
  on c.id = s.course_id
  and c.is_public = true
  and c.revision = s.course_revision
group by s.racer_name;

-- Raw SQL-created tables need both PostgreSQL privileges and matching RLS
-- policies. Column grants keep internal identifiers out of ordinary reads.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.courses from public, anon, authenticated;
revoke all on table public.course_votes from public, anon, authenticated;
revoke all on table public.race_scores from public, anon, authenticated;

grant select (id, display_name) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select (
  id, name, author_name, grid, theme, is_public, revision, created_at, updated_at
) on table public.courses to anon, authenticated;
grant insert (id, author_id, name, grid, theme, is_public)
  on table public.courses to authenticated;
grant update (name, grid, theme, is_public)
  on table public.courses to authenticated;
grant delete on table public.courses to authenticated;

grant select (course_id) on table public.course_votes to anon, authenticated;
grant insert (course_id, user_id) on table public.course_votes to authenticated;
grant delete on table public.course_votes to authenticated;

grant select (
  course_id, course_revision, racer_name, time_ms, points_earned, created_at
) on table public.race_scores to anon, authenticated;
grant insert (
  course_id, course_revision, user_id, racer_name, time_ms,
  points_earned, client_result_id
) on table public.race_scores to authenticated;

grant select on public.course_vote_counts to anon, authenticated;
grant select on public.course_catalog to anon, authenticated;
grant select on public.race_score_leaderboard to anon, authenticated;
grant select on public.racer_points_leaderboard to anon, authenticated;

-- The browser may submit a score, but the browser is not a trusted referee.
-- time_ms and points_earned are bounded and authenticated, not authoritative.
-- A future server-side scoring function should replace direct score inserts if
-- the leaderboard must resist modified clients.
