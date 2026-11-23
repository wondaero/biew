-- 그림 슬라이드(PDF·이미지) 2단계: 인터넷 송출 채널의 폰 리모컨·보기가 그림을 받을 수 있게(2026-11-23 사용자 결정).
--  - 그림이 있을 때만 생긴다: 선곡에 그림 묶음이 없는 채널은 이 표에 아무것도 없다(로컬 송출은 서버와 무관).
--  - 선곡 항목마다 따로(item_key) — 같은 그림인지 따지지 않는다. 선곡에서 빼면 그 항목 줄을 바로 지운다(host_prune_media).
--  - 채널을 지우면 함께 지워진다(on delete cascade — 파일 저장소가 아니라 표라서 '한 번에' 지워짐, 따로 정리할 파일 없음).
--  - 장마다 큰 그림(full, 보기 화면)과 작은 그림(thumb, 리모컨) 두 벌.
--  - 직접 읽기·쓰기 불가(RLS, 정책 없음). 토큰을 확인하는 함수로만:
--      올리기·목록·지우기 = 호스트 토큰 / 받기 = 호스트·리모컨 토큰, 보기는 보기 비밀번호가 없으면 번호만으로(상태와 같은 규칙)
--  - PC 의 송출(출력 창)은 서버를 거치지 않는다 — PC 에 있는 사본으로(인터넷이 끊겨도 송출 유지).

create table if not exists public.channel_media (
  code       text not null references public.channels(code) on delete cascade,
  item_key   text not null check (length(item_key) between 1 and 64),
  idx        int  not null check (idx between 0 and 299),
  variant    text not null check (variant in ('full', 'thumb')),
  media_id   text not null check (media_id ~ '^[0-9a-f]{8,64}$'),
  data       bytea not null check (octet_length(data) <= 3 * 1024 * 1024),
  created_at timestamptz not null default now(),
  primary key (code, item_key, idx, variant)
);
create index if not exists channel_media_lookup on public.channel_media (code, media_id, variant);
alter table public.channel_media enable row level security;
revoke all on public.channel_media from anon, authenticated;

-- 채널 하나에 둘 수 있는 그림 총량(장난·실수로 DB 가 차지 않게). 100장 ≈ 20MB 이므로 넉넉
create or replace function public._media_quota() returns bigint language sql immutable as $$ select 200::bigint * 1024 * 1024 $$;

-- 올리기(같은 자리면 덮어씀)
create or replace function public.host_put_media(p_code text, p_token text, p_key text, p_idx int, p_variant text, p_media_id text, p_data text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(p_code); v_data bytea; v_used bigint;
begin
  if not exists (select 1 from public.channels where code = v_code) then return 'not_found'; end if;
  if not public._session_ok(v_code, p_token, 'host') then return 'token_rejected'; end if;
  begin
    v_data := decode(p_data, 'base64');
  exception when others then return 'invalid';
  end;
  if octet_length(v_data) > 3 * 1024 * 1024 then return 'too_big'; end if;
  select coalesce(sum(octet_length(data)), 0) into v_used from public.channel_media
    where code = v_code and not (item_key = p_key and idx = p_idx and variant = p_variant);
  if v_used + octet_length(v_data) > public._media_quota() then return 'quota'; end if;
  insert into public.channel_media (code, item_key, idx, variant, media_id, data)
    values (v_code, p_key, p_idx, p_variant, lower(p_media_id), v_data)
    on conflict (code, item_key, idx, variant) do update set media_id = excluded.media_id, data = excluded.data, created_at = now();
  return 'ok';
exception when check_violation then return 'invalid';
end $$;

-- 서버에 이미 있는 것(호스트가 무엇을 더 올릴지 판단)
create or replace function public.host_media_list(p_code text, p_token text)
returns table (status text, item_key text, idx int, variant text, media_id text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code);
begin
  if not exists (select 1 from public.channels where code = v_code) then return query select 'not_found'::text, null::text, null::int, null::text, null::text; return; end if;
  if not public._session_ok(v_code, p_token, 'host') then return query select 'token_rejected'::text, null::text, null::int, null::text, null::text; return; end if;
  return query select 'ok'::text, null::text, null::int, null::text, null::text; -- 첫 줄 = 상태(그림이 없어도 ok 를 알 수 있게)
  return query select 'ok'::text, m.item_key, m.idx, m.variant, m.media_id from public.channel_media m where m.code = v_code;
end $$;

-- 선곡에 없는 항목의 그림 지우기(keep = 지금 선곡의 그림 묶음 key 들). 지운 줄 수, 실패면 -1
create or replace function public.host_prune_media(p_code text, p_token text, p_keep text[])
returns int
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(p_code); n int;
begin
  if not public._session_ok(v_code, p_token, 'host') then return -1; end if;
  delete from public.channel_media where code = v_code and not (item_key = any(coalesce(p_keep, '{}')));
  get diagnostics n = row_count;
  return n;
end $$;

-- 받기. p_kind = 'host' | 'control' | 'view'. 원하는 크기가 없으면 다른 크기라도. 없으면 status 'missing'(아직 안 올라옴)
create or replace function public.get_media(p_code text, p_kind text, p_token text, p_media_id text, p_variant text)
returns table (status text, data text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); s public.channel_secrets; ok boolean; v bytea;
begin
  select * into s from public.channel_secrets where code = v_code;
  if not found then return query select 'not_found'::text, null::text; return; end if;
  ok := case p_kind
    when 'host' then public._session_ok(v_code, p_token, 'host')
    when 'control' then public._session_ok(v_code, p_token, 'control')
    when 'view' then s.view_hash is null or public._session_ok(v_code, p_token, 'view')
    else false end;
  if not ok then return query select 'token_rejected'::text, null::text; return; end if;
  select m.data into v from public.channel_media m
    where m.code = v_code and m.media_id = lower(p_media_id)
    order by (m.variant = p_variant) desc limit 1;
  if v is null then return query select 'missing'::text, null::text; return; end if;
  return query select 'ok'::text, encode(v, 'base64');
end $$;

revoke all on function public._media_quota() from public, anon, authenticated;
revoke all on function public.host_put_media(text, text, text, int, text, text, text) from public;
revoke all on function public.host_media_list(text, text) from public;
revoke all on function public.host_prune_media(text, text, text[]) from public;
revoke all on function public.get_media(text, text, text, text, text) from public;
grant execute on function public.host_put_media(text, text, text, int, text, text, text) to anon, authenticated;
grant execute on function public.host_media_list(text, text) to anon, authenticated;
grant execute on function public.host_prune_media(text, text, text[]) to anon, authenticated;
grant execute on function public.get_media(text, text, text, text, text) to anon, authenticated;
