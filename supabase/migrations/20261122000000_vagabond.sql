create schema if not exists vagabond;
create extension if not exists pg_cron;
create extension if not exists pgcrypto with schema extensions;

create table public.vagabond_rooms (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  players uuid[] not null,
  names text[] not null,
  seen timestamptz[] not null,
  departed boolean[] not null default '{false,false}',
  seconds integer not null check (seconds in (0,15,30,60)),
  state text not null default 'waiting' check (state in ('waiting','playing','finished','closed')),
  light integer[] not null default '{2,11,24,33}',
  dark integer[] not null default '{3,6,29,32}',
  light_slot integer not null default 1,
  turn integer not null default 1,
  deadline timestamptz,
  winner integer,
  reason text,
  winning integer[] not null default '{}',
  route integer[] not null default '{}',
  round integer not null default 1,
  moves integer not null default 0,
  votes integer[] not null default '{0,0}',
  revision bigint not null default 0
);

alter table public.vagabond_rooms enable row level security;
revoke all on public.vagabond_rooms from public, anon, authenticated;
grant select on public.vagabond_rooms to authenticated;
create policy read_own_room on public.vagabond_rooms for select to authenticated
  using ((select auth.uid()) = any(players) and not departed[array_position(players, (select auth.uid()))]);
alter publication supabase_realtime add table public.vagabond_rooms;

create function vagabond.bump_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
create trigger vagabond_revision before update on public.vagabond_rooms
for each row execute function vagabond.bump_revision();

create function vagabond.nickname(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare n text := btrim(p_name);
begin
  if n is null or char_length(n) not between 2 and 16 or n ~ '[<>[:cntrl:]]' then
    raise exception 'Il nickname deve contenere da 2 a 16 caratteri validi.';
  end if;
  return n;
end;
$$;

create function vagabond.path(a integer, b integer, occupied integer[]) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare
  queue integer[] := array[a];
  previous integer[] := array_fill(null::integer, array[36], array[0]);
  head integer := 1;
  node integer;
  next integer;
  result integer[] := array[b];
begin
  if a is null or b is null or a not between 0 and 35 or b not between 0 and 35
    or a = b or b = any(occupied) then return '{}'; end if;
  previous[a] := a;
  while head <= cardinality(queue) loop
    node := queue[head];
    head := head + 1;
    if node = b then
      while node <> a loop
        node := previous[node];
        result := array_prepend(node, result);
      end loop;
      return result;
    end if;
    foreach next in array array[node + 1, node + 6, node - 1, node - 6] loop
      if next between 0 and 35 and abs(next % 6 - node % 6) + abs(next / 6 - node / 6) = 1
        and previous[next] is null and not (next = any(occupied)) then
        previous[next] := node;
        queue := array_append(queue, next);
      end if;
    end loop;
  end loop;
  return '{}';
end;
$$;

create function vagabond.line(pieces integer[]) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare
  node integer;
  dx integer;
  dy integer;
  candidate integer[];
begin
  for node in 0..35 loop
    for dy in 0..1 loop
      for dx in -1..1 loop
        if (dy = 0 and dx <> 1) or node % 6 + 3 * dx not between 0 and 5
          or node / 6 + 3 * dy > 5 then continue; end if;
        candidate := array[node, node + dx + 6 * dy, node + 2 * (dx + 6 * dy), node + 3 * (dx + 6 * dy)];
        if candidate <@ pieces then return candidate; end if;
      end loop;
    end loop;
  end loop;
  return '{}';
end;
$$;

create function vagabond.expire() returns void
language sql set search_path = '' as $$
  update public.vagabond_rooms
  set state = 'finished', winner = 3 - turn, reason = 'timeout', deadline = null
  where state = 'playing' and deadline <= clock_timestamp();
$$;

create index vagabond_deadlines on public.vagabond_rooms(deadline) where state = 'playing';
select cron.schedule('vagabond-turn-expiry', '1 second', 'select vagabond.expire()');

create function public.vagabond_action(
  action text, room_code text default null, nickname text default null,
  turn_seconds integer default null, origin integer default null, destination integer default null,
  expected_round integer default null, expected_moves integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.vagabond_rooms;
  slot integer;
  current_time_server timestamptz;
  random_bytes bytea;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated text;
  route_found integer[];
begin
  if uid is null then raise exception 'Sessione assente.'; end if;

  if action = 'create' then
    if turn_seconds is null or turn_seconds not in (0,15,30,60) then
      raise exception 'Timer non valido.';
    end if;
    nickname := vagabond.nickname(nickname);
    loop
      random_bytes := extensions.gen_random_bytes(6);
      generated := '';
      for i in 0..5 loop
        generated := generated || substr(alphabet, 1 + get_byte(random_bytes,i) % 32, 1);
      end loop;
      insert into public.vagabond_rooms(code, players, names, seen, seconds)
      values (generated, array[uid], array[nickname], array[clock_timestamp()], turn_seconds)
      on conflict (code) do nothing returning * into g;
      exit when found;
    end loop;
    return jsonb_build_object('room', to_jsonb(g), 'serverTime', clock_timestamp());
  end if;

  if room_code is null or room_code !~ '^[A-Z2-9]{6}$' then raise exception 'Inserisci un codice valido di 6 caratteri.'; end if;
  select * into g from public.vagabond_rooms where code = room_code for update;
  if not found then raise exception 'Lobby inesistente.'; end if;
  current_time_server := clock_timestamp();
  slot := array_position(g.players, uid);

  if action = 'join' and slot is null then
    if g.state = 'closed' then raise exception 'La lobby è chiusa.'; end if;
    if cardinality(g.players) = 2 then raise exception 'La lobby è piena.'; end if;
    if g.state <> 'waiting' then raise exception 'La partita è già iniziata.'; end if;
    g.players[2] := uid;
    g.names[2] := vagabond.nickname(nickname);
    g.seen[2] := current_time_server;
    g.state := 'playing';
    g.deadline := current_time_server + make_interval(secs => nullif(g.seconds,0));
    slot := 2;
  elsif slot is null or g.departed[slot] or g.state = 'closed' then
    raise exception 'La lobby non è più disponibile per questa sessione.';
  end if;

  if g.state = 'playing' and g.deadline <= current_time_server then
    g.state := 'finished';
    g.winner := 3 - g.turn;
    g.reason := 'timeout';
    g.deadline := null;
  end if;

  if action in ('join','sync') then
    g.seen[slot] := current_time_server;
  elsif action = 'rename' then
    g.names[slot] := vagabond.nickname(nickname);
  elsif action = 'move' then
    if g.reason is distinct from 'timeout' or g.state = 'playing' then
      if g.state <> 'playing' then raise exception 'La partita è terminata.'; end if;
      if g.round is distinct from expected_round or g.moves is distinct from expected_moves then
        raise exception 'Il turno è cambiato.';
      end if;
      if slot <> g.turn then raise exception 'Attendi il tuo turno.'; end if;
      if not coalesce(origin = any(case when slot = g.light_slot then g.light else g.dark end),false) then
        raise exception 'Scegli una delle tue pedine.';
      end if;
      route_found := vagabond.path(origin, destination, g.light || g.dark);
      if cardinality(route_found) = 0 then raise exception 'Destinazione irraggiungibile.'; end if;
      g.route := route_found;
      g.moves := g.moves + 1;
      if slot = g.light_slot then
        g.light := array_replace(g.light,origin,destination);
        g.winning := vagabond.line(g.light);
      else
        g.dark := array_replace(g.dark,origin,destination);
        g.winning := vagabond.line(g.dark);
      end if;
      if cardinality(g.winning) = 4 then
        g.state := 'finished';
        g.winner := slot;
        g.reason := 'line';
        g.deadline := null;
      else
        g.turn := 3 - slot;
        g.deadline := current_time_server + make_interval(secs => nullif(g.seconds,0));
      end if;
    end if;
  elsif action in ('rematch','decline') then
    if g.state <> 'finished' or g.round is distinct from expected_round
      or true = any(g.departed) or -1 = any(g.votes) then
      raise exception 'La rivincita non è disponibile.';
    end if;
    g.votes[slot] := case when action = 'decline' then -1 else 1 end;
    if g.votes = array[1,1] then
      g.round := g.round + 1;
      g.moves := 0;
      g.light_slot := 3 - g.light_slot;
      g.turn := g.light_slot;
      g.light := '{2,11,24,33}';
      g.dark := '{3,6,29,32}';
      g.state := 'playing';
      g.deadline := current_time_server + make_interval(secs => nullif(g.seconds,0));
      g.winner := null;
      g.reason := null;
      g.route := '{}';
      g.winning := '{}';
      g.votes := '{0,0}';
    end if;
  elsif action = 'leave' then
    g.departed[slot] := true;
    if g.state = 'waiting' or (true = all(g.departed)) then
      g.state := 'closed';
    elsif g.state = 'playing' then
      g.state := 'finished';
      g.winner := 3 - slot;
      g.reason := 'leave';
      g.deadline := null;
    end if;
  else
    raise exception 'Azione non valida.';
  end if;

  update public.vagabond_rooms set
    players = g.players, names = g.names, seen = g.seen, departed = g.departed, state = g.state,
    light = g.light, dark = g.dark, light_slot = g.light_slot, turn = g.turn,
    deadline = g.deadline, winner = g.winner, reason = g.reason, winning = g.winning,
    route = g.route, round = g.round, moves = g.moves, votes = g.votes
  where code = g.code returning * into g;
  return jsonb_build_object('room', to_jsonb(g), 'serverTime', clock_timestamp());
end;
$$;

revoke execute on function public.vagabond_action(text,text,text,integer,integer,integer,integer,integer) from public, anon;
grant execute on function public.vagabond_action(text,text,text,integer,integer,integer,integer,integer) to authenticated;
