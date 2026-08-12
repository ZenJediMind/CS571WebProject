-- Existing Race Night lobbies originally prevented a host or anyone in a
-- started race from leaving. Replace that restriction with deterministic host
-- handoff so every member can leave without stranding the lobby.
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
  next_host_id uuid;
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

  perform 1
  from public.race_lobby_members as member
  where member.lobby_id = p_lobby_id
    and member.user_id = current_user_id
  for update;
  if not found then
    raise exception 'You have not joined this race lobby.';
  end if;

  if lobby_host_id = current_user_id and lobby_status <> 'ended' then
    select member.user_id
    into next_host_id
    from public.race_lobby_members as member
    where member.lobby_id = p_lobby_id
      and member.user_id <> current_user_id
    order by member.joined_at asc, member.user_id asc
    limit 1
    for update;

    if next_host_id is null then
      update public.race_lobbies
      set status = 'ended', ended_at = pg_catalog.now()
      where id = p_lobby_id;
    else
      update public.race_lobbies
      set host_id = next_host_id
      where id = p_lobby_id;
    end if;
  end if;

  delete from public.race_lobby_members
  where lobby_id = p_lobby_id and user_id = current_user_id;
  return true;
end;
$function$;

revoke all on function public.leave_race_lobby(uuid) from public, anon, authenticated;
grant execute on function public.leave_race_lobby(uuid) to authenticated;
