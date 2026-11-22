\set ON_ERROR_STOP on

-- Commit the fixture so that the independent pg_cron connection can see the room.
insert into public.vagabond_rooms(code, players, names, seen, seconds, state, deadline)
values (
  'ZZZX92', array[gen_random_uuid(), gen_random_uuid()], array['Ada', 'Luigi'],
  array[clock_timestamp(), clock_timestamp()], 15, 'playing', clock_timestamp() + interval '1 second'
);

-- No lobby RPC is invoked while waiting.
do $$
declare
  started timestamptz := clock_timestamp();
begin
  while not exists (
    select 1 from public.vagabond_rooms
    where code = 'ZZZX92' and state = 'finished' and winner = 2 and reason = 'timeout' and deadline is null
  ) loop
    if clock_timestamp() - started > interval '25 seconds' then
      raise exception 'pg_cron non ha chiuso la partita scaduta';
    end if;
    perform pg_sleep(0.25);
  end loop;
end;
$$;

delete from public.vagabond_rooms where code = 'ZZZX92';
