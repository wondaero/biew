-- 정리: 지금 앱이 쓰지 않는 DB 객체 제거.
--  - 옛 폰 공유(rooms / get_room): 채널 구조로 대체됨. 데이터도 비어 있음.
--  - channel_topics: 호스트 PC 는 issue_host_token / host_join 으로 주소를 받는다.
--  - _broadcast_state: DB 발 공개 알림이 전달되지 않아 비워 둔 함수(20261118010000). 호출부까지 제거.
--  - 비밀번호 실패 횟수·잠금 컬럼: 서버 잠금을 없앰(폰별 잠금은 클라이언트). 참조하는 함수부터 다시 만든 뒤 컬럼 제거.

drop function if exists public.get_room(text);
drop table if exists public.rooms;
drop function if exists public.channel_topics(text);

-- ── _broadcast_state 호출 제거 ──
create or replace function public.host_set_state(p_code text, p_token text, p_state jsonb, p_force boolean default false)
returns table (status text, version bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); v bigint; cur bigint;
begin
  if not exists (select 1 from public.channels where code = v_code) then
    return query select 'not_found'::text, null::bigint; return;
  end if;
  if not public._session_ok(v_code, p_token, 'host') then
    return query select 'token_rejected'::text, null::bigint; return;
  end if;
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state->'setlist') <> 'array' or jsonb_typeof(p_state->'version') <> 'number' then
    return query select 'invalid'::text, null::bigint; return;
  end if;
  v := (p_state->>'version')::bigint;
  update public.channels set state = p_state, version = v, updated_at = now()
    where code = v_code and (p_force or v > public.channels.version);
  if found then
    return query select 'ok'::text, v;
  else
    select c.version into cur from public.channels c where c.code = v_code;
    return query select 'stale'::text, cur;
  end if;
end $$;

create or replace function public.remote_command(p_code text, p_token text, p_cmd jsonb)
returns table (status text, state jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); st jsonb; nw jsonb;
begin
  if not exists (select 1 from public.channels where code = v_code) then
    return query select 'not_found'::text, null::jsonb; return;
  end if;
  if not public._session_ok(v_code, p_token, 'control') then
    return query select 'token_rejected'::text, null::jsonb; return;
  end if;
  select c.state into st from public.channels c where c.code = v_code for update;
  nw := public._apply_command(st, p_cmd);
  if nw is null then return query select 'noop'::text, st; return; end if;
  update public.channels set state = nw, version = (nw->>'version')::bigint, updated_at = now() where code = v_code;
  return query select 'ok'::text, nw;
end $$;

drop function if exists public._broadcast_state(text, jsonb);

-- ── 실패 횟수 컬럼을 쓰던 함수 다시 만들기 ──
create or replace function public.kick_remotes(p_code text, p_new_control_password text)
returns table (control_topic text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); s public.channel_secrets;
begin
  if not exists (select 1 from public.channels where code = v_code and owner = auth.uid()) then raise exception 'not found'; end if;
  if p_new_control_password is null or char_length(p_new_control_password) < 4 then raise exception 'control password too short'; end if;
  select * into s from public.channel_secrets where code = v_code;
  if extensions.crypt(p_new_control_password, s.control_hash) = s.control_hash then raise exception 'same password'; end if;

  delete from public.channel_sessions where code = v_code and kind = 'control';
  update public.channel_secrets set
    control_hash = extensions.crypt(p_new_control_password, extensions.gen_salt('bf')),
    control_topic = encode(extensions.gen_random_bytes(16), 'hex')
  where code = v_code;
  update public.channels set updated_at = now() where code = v_code;
  return query select x.control_topic from public.channel_secrets x where x.code = v_code;
end $$;

create or replace function public.set_view_password(p_code text, p_new_view_password text)
returns table (view_topic text, has_view_password boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); s public.channel_secrets; v_pw text := nullif(p_new_view_password, '');
begin
  if not exists (select 1 from public.channels where code = v_code and owner = auth.uid()) then raise exception 'not found'; end if;
  select * into s from public.channel_secrets where code = v_code;
  if v_pw is null then
    update public.channel_secrets set view_hash = null where code = v_code;
    delete from public.channel_sessions where code = v_code and kind = 'view';
  else
    if char_length(v_pw) < 4 then raise exception 'view password too short'; end if;
    if s.view_hash is not null and extensions.crypt(v_pw, s.view_hash) = s.view_hash then raise exception 'same password'; end if;
    delete from public.channel_sessions where code = v_code and kind = 'view';
    update public.channel_secrets set
      view_hash = extensions.crypt(v_pw, extensions.gen_salt('bf')),
      view_topic = encode(extensions.gen_random_bytes(16), 'hex')
    where code = v_code;
  end if;
  update public.channels set has_view_password = (v_pw is not null), updated_at = now() where code = v_code;
  return query select x.view_topic, (x.view_hash is not null) from public.channel_secrets x where x.code = v_code;
end $$;

alter table public.channel_secrets
  drop column if exists control_fails,
  drop column if exists control_locked_until,
  drop column if exists view_fails,
  drop column if exists view_locked_until;
