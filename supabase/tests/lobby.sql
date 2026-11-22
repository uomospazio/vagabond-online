\set ON_ERROR_STOP on
begin;

do $$
declare
  host constant uuid := '11111111-1111-4111-8111-111111111111';
  guest constant uuid := '22222222-2222-4222-8222-222222222222';
  extra constant uuid := '33333333-3333-4333-8333-333333333333';
  room jsonb;
  lobby_code text;
  deadline text;
  outcome text;
begin
  assert vagabond.path(0, 8, '{0,1}') = '{0,6,7,8}';
  assert vagabond.path(0, 2, '{0,1,7,13,19,25,31}') = '{}';
  assert vagabond.path(0, 1, '{0,1}') = '{}';
  assert vagabond.line('{1,2,3,4}') = '{1,2,3,4}';
  assert vagabond.line('{2,8,14,20}') = '{2,8,14,20}';
  assert vagabond.line('{0,7,14,21}') = '{0,7,14,21}';
  assert vagabond.line('{5,10,15,20}') = '{5,10,15,20}';
  assert not has_table_privilege('authenticated', 'public.vagabond_rooms', 'UPDATE');
  assert not has_function_privilege('anon', 'public.vagabond_action(text,text,text,integer,integer,integer,integer,integer)', 'EXECUTE');

  perform set_config('request.jwt.claim.sub', host::text, true);
  room := public.vagabond_action('create', nickname => 'Ada', turn_seconds => 30)->'room';
  lobby_code := room->>'code';
  assert lobby_code ~ '^[A-Z2-9]{6}$';
  assert room->>'state' = 'waiting';
  assert room->'light' = '[2,11,24,33]';
  assert room->'dark' = '[3,6,29,32]';

  perform set_config('request.jwt.claim.sub', guest::text, true);
  room := public.vagabond_action('join', lobby_code, 'Luigi')->'room';
  assert room->>'state' = 'playing';
  assert room->>'turn' = '1';
  assert jsonb_array_length(room->'players') = 2;
  assert (room->>'deadline')::timestamptz > clock_timestamp();
  begin
    perform public.vagabond_action('move', lobby_code, origin => 3, destination => 4, expected_round => 1, expected_moves => 0);
    raise exception 'Il secondo giocatore ha mosso fuori turno';
  exception when raise_exception then
    assert sqlerrm = 'Attendi il tuo turno.';
  end;

  perform set_config('request.jwt.claim.sub', extra::text, true);
  begin
    perform public.vagabond_action('join', lobby_code, 'Terzo');
    raise exception 'Un terzo giocatore è entrato';
  exception when raise_exception then
    assert sqlerrm = 'La lobby è piena.';
  end;
  perform set_config('vagabond.test_code', lobby_code, true);
  execute 'set local role authenticated';
  assert (select count(*) = 0 from public.vagabond_rooms r where r.code = current_setting('vagabond.test_code'));
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', host::text, true);
  room := public.vagabond_action('move', lobby_code, origin => 2, destination => 8, expected_round => 1, expected_moves => 0)->'room';
  assert room->>'turn' = '2';
  assert room->'route' = '[2,8]';
  assert room->'light' = '[8,11,24,33]';
  deadline := room->>'deadline';
  room := public.vagabond_action('rename', lobby_code, 'Àda & 🦊')->'room';
  assert room->'names' = '["Àda & 🦊","Luigi"]';
  assert room->>'deadline' = deadline;
  assert room->>'turn' = '2';
  assert room->>'moves' = '1';
  begin
    perform public.vagabond_action('rename', lobby_code, '<script>');
    raise exception 'La validazione ha accettato markup';
  exception when raise_exception then
    assert sqlerrm = 'Il nickname deve contenere da 2 a 16 caratteri validi.';
  end;

  update public.vagabond_rooms r set seen[2] = clock_timestamp() - interval '1 minute' where r.code = lobby_code;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  room := public.vagabond_action('sync', lobby_code)->'room';
  assert room->'names' = '["Àda & 🦊","Luigi"]';
  assert (room->'seen'->>1)::timestamptz > clock_timestamp() - interval '5 seconds';
  assert room->'light' = '[8,11,24,33]';
  assert room->>'deadline' = deadline;

  update public.vagabond_rooms r set deadline = clock_timestamp() - interval '1 second' where r.code = lobby_code;
  assert exists(select 1 from cron.job where jobname = 'vagabond-turn-expiry' and active);
  perform vagabond.expire();
  room := public.vagabond_action('sync', lobby_code)->'room';
  assert room->>'state' = 'finished';
  assert room->>'winner' = '1';
  assert room->>'reason' = 'timeout';

  room := public.vagabond_action('rematch', lobby_code, expected_round => 1)->'room';
  assert room->>'state' = 'finished';
  assert room->'votes' = '[0,1]';
  perform set_config('request.jwt.claim.sub', host::text, true);
  room := public.vagabond_action('rematch', lobby_code, expected_round => 1)->'room';
  assert room->>'state' = 'playing';
  assert room->>'round' = '2';
  assert room->>'light_slot' = '2';
  assert room->>'turn' = '2';
  assert room->'light' = '[2,11,24,33]';
  assert room->'names' = '["Àda & 🦊","Luigi"]';
  assert room->>'seconds' = '30';
  begin
    perform public.vagabond_action('move', lobby_code, origin => 3, destination => 4, expected_round => 1, expected_moves => 0);
    raise exception 'Una mossa obsoleta è stata accettata';
  exception when raise_exception then
    assert sqlerrm = 'Il turno è cambiato.';
  end;

  update public.vagabond_rooms r set light = '{0,1,2,9}', dark = '{6,13,29,32}' where r.code = lobby_code;
  perform set_config('request.jwt.claim.sub', guest::text, true);
  room := public.vagabond_action('move', lobby_code, origin => 9, destination => 3, expected_round => 2, expected_moves => 0)->'room';
  assert room->>'state' = 'finished';
  assert room->>'winner' = '2';
  assert room->'winning' = '[0,1,2,3]';
  perform public.vagabond_action('rematch', lobby_code, expected_round => 2);
  perform set_config('request.jwt.claim.sub', host::text, true);
  room := public.vagabond_action('decline', lobby_code, expected_round => 2)->'room';
  assert room->'votes' = '[-1,1]';
  outcome := room->>'state';
  assert outcome = 'finished';
end;
$$;
rollback;
