-- 채널: 예배/행사 하나 = 채널 하나. 만든 계정만 만들기·목록·삭제.
-- 접근은 두 종류의 비밀번호 + 서버가 주는 토큰으로 통제한다(폰은 계정 로그인 없이 컨트롤/보기 가능).
--   control : 송출 조작만 (이동·BLANK·FREEZE). 곡/콘티/스타일 수정 불가 — 클라이언트에 그 권한 자체가 없음.
--   view    : 보기 전용. 비밀번호는 선택(없으면 번호만 알면 누구나).
-- 실시간 연결(Realtime) 주소에는 번호가 아니라 '추측 불가 토큰(topic)'을 쓴다 → 번호만 알아서는 엿들을 수 없음.
-- 기존 rooms/get_room 은 프런트 전환이 끝날 때까지 그대로 둔다(이 마이그레이션은 건드리지 않음).

create extension if not exists pgcrypto with schema extensions;

-- ── 채널 본체(공개 가능한 메타 + 현재 상태). 소유 계정만 접근 ───────────────
create table if not exists public.channels (
  code              text primary key check (code ~ '^[A-Z2-9]{6}$'),
  owner             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 60),
  has_view_password boolean not null default false,
  state             jsonb not null default '{}'::jsonb,   -- 호스트(PC 컨트롤러)가 덮어씀. 늦게 들어온 기기의 초기값
  version           bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.channels enable row level security;

drop policy if exists channels_owner_select on public.channels;
create policy channels_owner_select on public.channels for select to authenticated using (owner = auth.uid());
drop policy if exists channels_owner_update on public.channels;
create policy channels_owner_update on public.channels for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists channels_owner_delete on public.channels;
create policy channels_owner_delete on public.channels for delete to authenticated using (owner = auth.uid());
-- insert 정책 없음 → 생성은 create_channel() 로만

-- 소유자도 직접 바꿀 수 있는 컬럼은 이것뿐(owner/code/has_view_password 변조 방지)
revoke update on public.channels from authenticated;
grant update (title, state, version, updated_at) on public.channels to authenticated;

-- ── 비밀 정보(해시·topic·실패 횟수). 정책 없음 + 권한 회수 = 클라이언트에서 접근 불가, 함수만 접근 ──
create table if not exists public.channel_secrets (
  code                 text primary key references public.channels(code) on delete cascade,
  control_hash         text not null,                  -- bcrypt. 원문 저장 안 함
  view_hash            text,                           -- null = 비밀번호 없음
  control_topic        text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  view_topic           text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  control_fails        int  not null default 0,
  control_locked_until timestamptz,
  view_fails           int  not null default 0,
  view_locked_until    timestamptz
);
alter table public.channel_secrets enable row level security;
revoke all on public.channel_secrets from anon, authenticated;

-- ── 기기 토큰. 원문은 기기만 갖고 서버엔 sha256 해시만. 마지막 사용 후 30일이면 만료 ──
create table if not exists public.channel_sessions (
  token_hash   text primary key,
  code         text not null references public.channels(code) on delete cascade,
  kind         text not null check (kind in ('control', 'view')),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists channel_sessions_code_idx on public.channel_sessions(code);
alter table public.channel_sessions enable row level security;
revoke all on public.channel_sessions from anon, authenticated;

-- ── 채널 만들기 (로그인 필요) ───────────────────────────────────────
create or replace function public.create_channel(p_title text, p_control_password text, p_view_password text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 헷갈리는 글자(0,O,1,I,L) 제외 31자
  v_code  text;
  v_bytes bytea;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  p_title := btrim(coalesce(p_title, ''));
  if char_length(p_title) not between 1 and 60 then raise exception 'invalid title'; end if;
  if p_control_password is null or char_length(p_control_password) < 4 then raise exception 'control password too short'; end if;
  if p_view_password = '' then p_view_password := null; end if;
  if p_view_password is not null and char_length(p_view_password) < 4 then raise exception 'view password too short'; end if;

  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.channels where code = v_code);
  end loop;

  insert into public.channels (code, title, has_view_password) values (v_code, p_title, p_view_password is not null);
  insert into public.channel_secrets (code, control_hash, view_hash) values (
    v_code,
    extensions.crypt(p_control_password, extensions.gen_salt('bf')),
    case when p_view_password is null then null else extensions.crypt(p_view_password, extensions.gen_salt('bf')) end
  );
  return v_code;
end $$;

-- ── 소유자: 내 채널의 실시간 topic (호스트 PC 가 구독/송신에 사용) ──────────
create or replace function public.channel_topics(p_code text)
returns table (control_topic text, view_topic text)
language sql stable security definer set search_path = '' as $$
  select s.control_topic, s.view_topic
  from public.channel_secrets s join public.channels c on c.code = s.code
  where s.code = upper(p_code) and c.owner = auth.uid()
$$;

-- ── 소유자: 모든 기기 접속 끊기 / 비밀번호 변경 ─────────────────────────
-- 토큰 전부 삭제 + topic 재발급. 이전 토큰/topic 을 가진 기기는 다음 요청에서 거부된다.
create or replace function public.reset_channel_access(
  p_code text,
  p_control_password text default null,   -- null = 유지
  p_view_password text default null,      -- null = 유지
  p_remove_view_password boolean default false
)
returns table (control_topic text, view_topic text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code);
begin
  if not exists (select 1 from public.channels where code = v_code and owner = auth.uid()) then
    raise exception 'not found';
  end if;
  if p_control_password is not null and char_length(p_control_password) < 4 then raise exception 'control password too short'; end if;
  if p_view_password is not null and char_length(p_view_password) < 4 then raise exception 'view password too short'; end if;

  delete from public.channel_sessions where code = v_code;
  update public.channel_secrets set
    control_topic = encode(extensions.gen_random_bytes(16), 'hex'),
    view_topic    = encode(extensions.gen_random_bytes(16), 'hex'),
    control_hash  = case when p_control_password is null then control_hash else extensions.crypt(p_control_password, extensions.gen_salt('bf')) end,
    view_hash     = case
                      when p_remove_view_password then null
                      when p_view_password is null then view_hash
                      else extensions.crypt(p_view_password, extensions.gen_salt('bf'))
                    end,
    control_fails = 0, control_locked_until = null, view_fails = 0, view_locked_until = null
  where code = v_code;
  update public.channels set has_view_password = (select view_hash is not null from public.channel_secrets where code = v_code)
  where code = v_code;

  return query select s.control_topic, s.view_topic from public.channel_secrets s where s.code = v_code;
end $$;

-- ── 컨트롤 입장 (비로그인 가능). 토큰 또는 비밀번호 ───────────────────────
-- 실패를 예외로 던지면 실패 횟수 증가가 롤백되므로 status 로 돌려준다.
-- status: ok | not_found | password_required | token_rejected | bad_password | locked
create or replace function public.join_control(p_code text, p_password text default null, p_token text default null)
returns table (status text, title text, state jsonb, version bigint, control_topic text, view_topic text, token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_code text := upper(p_code);
  c public.channels;
  s public.channel_secrets;
  v_hash text;
  v_new text;
begin
  select * into c from public.channels where code = v_code;
  if not found then
    return query select 'not_found'::text, null::text, null::jsonb, null::bigint, null::text, null::text, null::text;
    return;
  end if;
  select * into s from public.channel_secrets where code = v_code;

  if p_token is not null then
    v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    update public.channel_sessions set last_used_at = now()
      where token_hash = v_hash and code = v_code and kind = 'control' and last_used_at > now() - interval '30 days';
    if found then
      return query select 'ok'::text, c.title, c.state, c.version, s.control_topic, s.view_topic, null::text;
      return;
    end if;
    if p_password is null then
      return query select 'token_rejected'::text, null::text, null::jsonb, null::bigint, null::text, null::text, null::text;
      return;
    end if;
  end if;

  if p_password is null then
    return query select 'password_required'::text, c.title, null::jsonb, null::bigint, null::text, null::text, null::text;
    return;
  end if;
  if s.control_locked_until is not null and s.control_locked_until > now() then
    return query select 'locked'::text, null::text, null::jsonb, null::bigint, null::text, null::text, null::text;
    return;
  end if;
  if extensions.crypt(p_password, s.control_hash) <> s.control_hash then
    update public.channel_secrets set
      control_fails = control_fails + 1,
      control_locked_until = case when control_fails + 1 >= 5 then now() + interval '60 seconds' else control_locked_until end
      where code = v_code;
    return query select 'bad_password'::text, null::text, null::jsonb, null::bigint, null::text, null::text, null::text;
    return;
  end if;

  update public.channel_secrets set control_fails = 0, control_locked_until = null where code = v_code;
  delete from public.channel_sessions where code = v_code and last_used_at <= now() - interval '30 days';
  v_new := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.channel_sessions (token_hash, code, kind) values (encode(extensions.digest(v_new, 'sha256'), 'hex'), v_code, 'control');
  return query select 'ok'::text, c.title, c.state, c.version, s.control_topic, s.view_topic, v_new;
end $$;

-- ── 보기 입장 (비로그인 가능). view 비밀번호가 없으면 번호만으로 ok ─────────
create or replace function public.join_view(p_code text, p_password text default null, p_token text default null)
returns table (status text, title text, state jsonb, version bigint, view_topic text, token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_code text := upper(p_code);
  c public.channels;
  s public.channel_secrets;
  v_hash text;
  v_new text;
begin
  select * into c from public.channels where code = v_code;
  if not found then
    return query select 'not_found'::text, null::text, null::jsonb, null::bigint, null::text, null::text;
    return;
  end if;
  select * into s from public.channel_secrets where code = v_code;

  if s.view_hash is null then
    return query select 'ok'::text, c.title, c.state, c.version, s.view_topic, null::text;
    return;
  end if;

  if p_token is not null then
    v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    update public.channel_sessions set last_used_at = now()
      where token_hash = v_hash and code = v_code and kind = 'view' and last_used_at > now() - interval '30 days';
    if found then
      return query select 'ok'::text, c.title, c.state, c.version, s.view_topic, null::text;
      return;
    end if;
    if p_password is null then
      return query select 'token_rejected'::text, null::text, null::jsonb, null::bigint, null::text, null::text;
      return;
    end if;
  end if;

  if p_password is null then
    return query select 'password_required'::text, c.title, null::jsonb, null::bigint, null::text, null::text;
    return;
  end if;
  if s.view_locked_until is not null and s.view_locked_until > now() then
    return query select 'locked'::text, null::text, null::jsonb, null::bigint, null::text, null::text;
    return;
  end if;
  if extensions.crypt(p_password, s.view_hash) <> s.view_hash then
    update public.channel_secrets set
      view_fails = view_fails + 1,
      view_locked_until = case when view_fails + 1 >= 5 then now() + interval '60 seconds' else view_locked_until end
      where code = v_code;
    return query select 'bad_password'::text, null::text, null::jsonb, null::bigint, null::text, null::text;
    return;
  end if;

  update public.channel_secrets set view_fails = 0, view_locked_until = null where code = v_code;
  delete from public.channel_sessions where code = v_code and last_used_at <= now() - interval '30 days';
  v_new := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.channel_sessions (token_hash, code, kind) values (encode(extensions.digest(v_new, 'sha256'), 'hex'), v_code, 'view');
  return query select 'ok'::text, c.title, c.state, c.version, s.view_topic, v_new;
end $$;

-- ── 실행 권한 ─────────────────────────────────────────────────────
revoke all on function public.create_channel(text, text, text) from public;
revoke all on function public.channel_topics(text) from public;
revoke all on function public.reset_channel_access(text, text, text, boolean) from public;
revoke all on function public.join_control(text, text, text) from public;
revoke all on function public.join_view(text, text, text) from public;

grant execute on function public.create_channel(text, text, text) to authenticated;
grant execute on function public.channel_topics(text) to authenticated;
grant execute on function public.reset_channel_access(text, text, text, boolean) to authenticated;
grant execute on function public.join_control(text, text, text) to anon, authenticated;
grant execute on function public.join_view(text, text, text) to anon, authenticated;
