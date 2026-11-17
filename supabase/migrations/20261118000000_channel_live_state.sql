-- 인터넷 송출: 송출 상태의 원본을 서버(channels.state)에 둔다.
--  - 호스트 PC 는 화면을 먼저 바꾸고 host_set_state 로 서버에 올린다(인터넷이 끊기면 PC 혼자 계속, 다시 연결되면 PC 기준으로 덮어씀 = force).
--  - 폰 리모컨 명령은 서버가 검사·적용한다(remote_command → _apply_command). PC 가 꺼져 있어도 리모컨·보기는 동작.
--  - 상태가 바뀌면 서버가 실시간 topic 으로 알린다(realtime.send). 호스트 PC 는 알림을 믿지 않고 서버에서 다시 읽는다
--    (topic 은 리모컨도 보낼 수 있어 가짜 상태를 섞을 수 있으므로).
--  - 호스트 PC 의 권한 = 채널 전용 호스트 토큰(로그인 아님). 채널을 만들 때/로그인해서 열 때 발급, 이 PC 에 저장.
--    '모든 기기 접속 끊기'는 호스트 토큰도 지운다 → 그 PC 는 거부를 받고 "로그인 필요"를 안다.
-- 로컬 송출(/local)은 서버와 무관하다.
-- 비밀번호 실패 잠금은 서버에서 하지 않는다(사용자 결정: 폰별로 클라이언트에서 막음). 실패 카운트 컬럼은 남겨 두되 쓰지 않는다.
-- 콘티는 그날 하루 쓰는 임시 데이터다 — 콘티 보관/가져오기 기능은 만들지 않는다(channels.state 에 현재 상태만 있다).

alter table public.channels add column if not exists state jsonb not null default '{}'::jsonb;
alter table public.channels add column if not exists version bigint not null default 0;

alter table public.channel_sessions drop constraint if exists channel_sessions_kind_check;
alter table public.channel_sessions add constraint channel_sessions_kind_check check (kind in ('control', 'view', 'host'));

-- ── 내부 도우미(클라이언트에서 호출 불가) ─────────────────────────────
-- 기기 토큰 확인(마지막 사용 후 30일 만료, 쓸 때마다 갱신)
create or replace function public._session_ok(p_code text, p_token text, p_kind text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null then return false; end if;
  update public.channel_sessions set last_used_at = now()
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and code = p_code and kind = p_kind and last_used_at > now() - interval '30 days';
  return found;
end $$;

create or replace function public._new_session(p_code text, p_kind text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_new text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  delete from public.channel_sessions where code = p_code and last_used_at <= now() - interval '30 days';
  insert into public.channel_sessions (token_hash, code, kind) values (encode(extensions.digest(v_new, 'sha256'), 'hex'), p_code, p_kind);
  return v_new;
end $$;

-- 상태가 바뀌었음을 보기 기기·리모컨·호스트에 알림(공개 Broadcast, 이벤트 'msg' — 클라이언트 SyncMessage 형식)
create or replace function public._broadcast_state(p_code text, p_state jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare s public.channel_secrets; msg jsonb := jsonb_build_object('type', 'state', 'state', p_state);
begin
  select * into s from public.channel_secrets where code = p_code;
  if not found then return; end if;
  perform realtime.send(msg, 'msg', 'ch:' || s.view_topic, false);
  perform realtime.send(msg, 'msg', 'ch:' || s.control_topic, false);
end $$;

/**
 * 리모컨 명령 적용 — src/live/nav.ts 와 같은 규칙(같은 결과인지 scripts/verify-channels.ts 가 대조한다).
 * 허용: next / prev / nextSong / prevSong / go(itemIndex, slideIndex) / blank. 그 외·범위 밖·변화 없음 = null.
 * 이동하면 blank 해제. FREEZE(frozen)는 건드리지 않는다(컨트롤러 위치만 움직이고 송출은 고정 — PC 와 같은 동작).
 */
create or replace function public._apply_command(st jsonb, cmd jsonb)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  sl jsonb := case when jsonb_typeof(st->'setlist') = 'array' then st->'setlist' else '[]'::jsonb end;
  n int := jsonb_array_length(sl);
  i int := coalesce((st->>'itemIndex')::int, 0);
  j int := coalesce((st->>'slideIndex')::int, 0);
  c text := cmd->>'cmd';
  ni int; nj int; k int;
  cur_len int;
  ver bigint := greatest(coalesce((st->>'version')::bigint, 0) + 1, (extract(epoch from clock_timestamp()) * 1000)::bigint);
  slides_len_k int;
begin
  cur_len := case when i >= 0 and i < n and jsonb_typeof(sl->i->'slides') = 'array' then jsonb_array_length(sl->i->'slides') else 0 end;

  if c = 'blank' then
    return st || jsonb_build_object('blank', not coalesce((st->>'blank')::boolean, false), 'version', ver, 'origin', 'server');
  elsif c = 'next' then
    if i >= 0 and i < n and j + 1 < cur_len then ni := i; nj := j + 1;
    else
      for k in i + 1 .. n - 1 loop
        if jsonb_array_length(coalesce(sl->k->'slides', '[]'::jsonb)) > 0 then ni := k; nj := 0; exit; end if;
      end loop;
    end if;
  elsif c = 'prev' then
    if j > 0 and i >= 0 and i < n then ni := i; nj := j - 1;
    else
      for k in reverse i - 1 .. 0 loop
        slides_len_k := jsonb_array_length(coalesce(sl->k->'slides', '[]'::jsonb));
        if slides_len_k > 0 then ni := k; nj := slides_len_k - 1; exit; end if;
      end loop;
    end if;
  elsif c = 'nextSong' then
    for k in i + 1 .. n - 1 loop
      if jsonb_array_length(coalesce(sl->k->'slides', '[]'::jsonb)) > 0 then ni := k; nj := 0; exit; end if;
    end loop;
  elsif c = 'prevSong' then
    if j > 0 and cur_len > 0 then ni := i; nj := 0;
    else
      for k in reverse i - 1 .. 0 loop
        if jsonb_array_length(coalesce(sl->k->'slides', '[]'::jsonb)) > 0 then ni := k; nj := 0; exit; end if;
      end loop;
    end if;
  elsif c = 'go' then
    if jsonb_typeof(cmd->'itemIndex') <> 'number' or jsonb_typeof(cmd->'slideIndex') <> 'number' then return null; end if;
    if (cmd->>'itemIndex')::numeric <> trunc((cmd->>'itemIndex')::numeric)
       or (cmd->>'slideIndex')::numeric <> trunc((cmd->>'slideIndex')::numeric) then return null; end if;
    ni := (cmd->>'itemIndex')::int; nj := (cmd->>'slideIndex')::int;
    if ni < 0 or ni >= n or nj < 0 or nj >= jsonb_array_length(coalesce(sl->ni->'slides', '[]'::jsonb)) then return null; end if;
  else
    return null;
  end if;

  if ni is null then return null; end if;
  return st || jsonb_build_object('itemIndex', ni, 'slideIndex', nj, 'blank', false, 'version', ver, 'origin', 'server');
end $$;

-- ── 호스트(PC) ────────────────────────────────────────────────
-- 소유 계정(로그인)으로 이 PC 용 호스트 토큰 발급 + 현재 상태
create or replace function public.issue_host_token(p_code text)
returns table (token text, title text, control_topic text, view_topic text, state jsonb, version bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); c public.channels; s public.channel_secrets;
begin
  select * into c from public.channels where code = v_code and owner = auth.uid();
  if not found then raise exception 'not found'; end if;
  select * into s from public.channel_secrets where code = v_code;
  return query select public._new_session(v_code, 'host'), c.title, s.control_topic, s.view_topic, c.state, c.version;
end $$;

-- 호스트 토큰으로 입장/재확인(로그인 불필요). status: ok | not_found | token_rejected
create or replace function public.host_join(p_code text, p_token text)
returns table (status text, title text, control_topic text, view_topic text, state jsonb, version bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); c public.channels; s public.channel_secrets;
begin
  select * into c from public.channels where code = v_code;
  if not found then return query select 'not_found'::text, null::text, null::text, null::text, null::jsonb, null::bigint; return; end if;
  if not public._session_ok(v_code, p_token, 'host') then
    return query select 'token_rejected'::text, null::text, null::text, null::text, null::jsonb, null::bigint; return;
  end if;
  select * into s from public.channel_secrets where code = v_code;
  return query select 'ok'::text, c.title, s.control_topic, s.view_topic, c.state, c.version;
end $$;

-- 호스트가 상태를 올림. 서버가 더 새로우면 'stale'(그 사이 리모컨이 바꿈) — 단 p_force(끊겼다 다시 연결)면 PC 기준으로 덮어씀.
-- status: ok | stale | not_found | token_rejected | invalid
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
    perform public._broadcast_state(v_code, p_state);
    return query select 'ok'::text, v;
  else
    select c.version into cur from public.channels c where c.code = v_code;
    return query select 'stale'::text, cur;
  end if;
end $$;

-- ── 리모컨 명령 (서버가 검사·적용 — PC 가 꺼져 있어도 동작) ──────────────
-- status: ok | noop(변화 없음·허용 안 됨) | not_found | token_rejected
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
  perform public._broadcast_state(v_code, nw);
  return query select 'ok'::text, nw;
end $$;

-- ── 입장 함수: 현재 상태도 돌려준다 + 서버 잠금 제거(반환 형식이 바뀌어 다시 만든다) ──────
drop function if exists public.join_control(text, text, text);
create function public.join_control(p_code text, p_password text default null, p_token text default null)
returns table (status text, title text, control_topic text, view_topic text, token text, state jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); c public.channels; s public.channel_secrets;
begin
  select * into c from public.channels where code = v_code;
  if not found then return query select 'not_found'::text, null::text, null::text, null::text, null::text, null::jsonb; return; end if;
  select * into s from public.channel_secrets where code = v_code;
  if public._session_ok(v_code, p_token, 'control') then
    return query select 'ok'::text, c.title, s.control_topic, s.view_topic, null::text, c.state; return;
  end if;
  if p_password is null then
    return query select (case when p_token is null then 'password_required' else 'token_rejected' end)::text,
      (case when p_token is null then c.title else null end)::text, null::text, null::text, null::text, null::jsonb;
    return;
  end if;
  if extensions.crypt(p_password, s.control_hash) <> s.control_hash then
    return query select 'bad_password'::text, null::text, null::text, null::text, null::text, null::jsonb; return;
  end if;
  return query select 'ok'::text, c.title, s.control_topic, s.view_topic, public._new_session(v_code, 'control'), c.state;
end $$;

drop function if exists public.join_view(text, text, text);
create function public.join_view(p_code text, p_password text default null, p_token text default null)
returns table (status text, title text, view_topic text, token text, state jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); c public.channels; s public.channel_secrets;
begin
  select * into c from public.channels where code = v_code;
  if not found then return query select 'not_found'::text, null::text, null::text, null::text, null::jsonb; return; end if;
  select * into s from public.channel_secrets where code = v_code;
  if s.view_hash is null or public._session_ok(v_code, p_token, 'view') then
    return query select 'ok'::text, c.title, s.view_topic, null::text, c.state; return;
  end if;
  if p_password is null then
    return query select (case when p_token is null then 'password_required' else 'token_rejected' end)::text,
      (case when p_token is null then c.title else null end)::text, null::text, null::text, null::jsonb;
    return;
  end if;
  if extensions.crypt(p_password, s.view_hash) <> s.view_hash then
    return query select 'bad_password'::text, null::text, null::text, null::text, null::jsonb; return;
  end if;
  return query select 'ok'::text, c.title, s.view_topic, public._new_session(v_code, 'view'), c.state;
end $$;

-- ── 권한 ─────────────────────────────────────────────────────────
revoke all on function public._session_ok(text, text, text) from public, anon, authenticated;
revoke all on function public._new_session(text, text) from public, anon, authenticated;
revoke all on function public._broadcast_state(text, jsonb) from public, anon, authenticated;
revoke all on function public._apply_command(jsonb, jsonb) from public, anon, authenticated; -- service_role 은 검증 스크립트용으로 유지

revoke all on function public.issue_host_token(text) from public, anon;
grant execute on function public.issue_host_token(text) to authenticated;

revoke all on function public.host_join(text, text) from public;
revoke all on function public.host_set_state(text, text, jsonb, boolean) from public;
revoke all on function public.remote_command(text, text, jsonb) from public;
revoke all on function public.join_control(text, text, text) from public;
revoke all on function public.join_view(text, text, text) from public;
grant execute on function public.host_join(text, text) to anon, authenticated;
grant execute on function public.host_set_state(text, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.remote_command(text, text, jsonb) to anon, authenticated;
grant execute on function public.join_control(text, text, text) to anon, authenticated;
grant execute on function public.join_view(text, text, text) to anon, authenticated;
