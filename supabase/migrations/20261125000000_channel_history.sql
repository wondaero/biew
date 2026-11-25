-- 선곡 기록(예배 기록) — 인터넷 송출 채널 안에 "지난주 예배·이번주 예배"를 쌓는다(2026-11-25 사용자 결정, 규칙: shared/history.ts).
--  - 기록 = 이름 · 저장 시각 · 선곡(곡 제목 + 그날 쓴 슬라이드). 그림 슬라이드는 넣지 않는다(빠진 묶음 수만) — 그림은 크고 선곡에서 빼면 바로 지우므로.
--  - 채널을 지우면 함께 지워진다(on delete cascade). 채널당 최근 100개만 남긴다(저장할 때 오래된 것부터 정리).
--  - 가장 최근 기록과 같은 선곡(fingerprint)이면 다시 저장하지 않는다('dup').
--  - 직접 읽기·쓰기 불가(RLS, 정책 없음). 호스트 토큰을 확인하는 함수로만 — 리모컨·보기 기기는 기록을 못 본다.
--  - 가사는 이미 channels.state(지금 선곡)에 같은 형태로 있으므로 새로 생기는 노출은 없다.

create table if not exists public.channel_history (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.channels(code) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  saved_at    timestamptz not null default now(),
  fingerprint text not null check (char_length(fingerprint) between 1 and 64),
  setlist     jsonb not null check (jsonb_typeof(setlist) = 'array' and octet_length(setlist::text) <= 2 * 1024 * 1024),
  skipped_media int not null default 0 check (skipped_media between 0 and 1000)
);
create index if not exists channel_history_by_code on public.channel_history (code, saved_at desc);
alter table public.channel_history enable row level security;
revoke all on public.channel_history from anon, authenticated;

create or replace function public._history_max() returns int language sql immutable as $$ select 100 $$;

-- 저장. p_saved_at = 기록 시각(인터넷이 끊겨 PC 에 보관했던 것을 나중에 올릴 때 그때 시각) — 미래·아주 옛날이면 지금으로
create or replace function public.host_history_save(p_code text, p_token text, p_title text, p_setlist jsonb, p_fingerprint text, p_skipped int, p_saved_at timestamptz default null)
returns table (status text, id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); v_last text; v_id uuid; v_at timestamptz;
begin
  if not exists (select 1 from public.channels c where c.code = v_code) then return query select 'not_found'::text, null::uuid; return; end if;
  if not public._session_ok(v_code, p_token, 'host') then return query select 'token_rejected'::text, null::uuid; return; end if;
  select h.fingerprint into v_last from public.channel_history h where h.code = v_code order by h.saved_at desc limit 1;
  if v_last = p_fingerprint then return query select 'dup'::text, null::uuid; return; end if;
  v_at := case when p_saved_at is null or p_saved_at > now() + interval '1 day' or p_saved_at < now() - interval '400 days' then now() else p_saved_at end;
  insert into public.channel_history (code, title, saved_at, fingerprint, setlist, skipped_media)
    values (v_code, btrim(p_title), v_at, p_fingerprint, p_setlist, coalesce(p_skipped, 0))
    returning channel_history.id into v_id;
  -- 오래된 것부터 정리(채널당 100개)
  delete from public.channel_history h where h.code = v_code and h.id in (
    select h2.id from public.channel_history h2 where h2.code = v_code order by h2.saved_at desc offset public._history_max());
  return query select 'ok'::text, v_id;
exception when check_violation then return query select 'invalid'::text, null::uuid;
end $$;

-- 목록(요약). 첫 줄 = 상태(기록이 없어도 ok 를 알 수 있게)
create or replace function public.host_history_list(p_code text, p_token text)
returns table (status text, id uuid, title text, saved_at timestamptz, songs int, skipped_media int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code);
begin
  if not exists (select 1 from public.channels c where c.code = v_code) then return query select 'not_found'::text, null::uuid, null::text, null::timestamptz, null::int, null::int; return; end if;
  if not public._session_ok(v_code, p_token, 'host') then return query select 'token_rejected'::text, null::uuid, null::text, null::timestamptz, null::int, null::int; return; end if;
  return query select 'ok'::text, null::uuid, null::text, null::timestamptz, null::int, null::int;
  return query select 'ok'::text, h.id, h.title, h.saved_at, jsonb_array_length(h.setlist), h.skipped_media
    from public.channel_history h where h.code = v_code order by h.saved_at desc;
end $$;

-- 한 기록의 선곡
create or replace function public.host_history_get(p_code text, p_token text, p_id uuid)
returns table (status text, setlist jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); v jsonb;
begin
  if not public._session_ok(v_code, p_token, 'host') then return query select 'token_rejected'::text, null::jsonb; return; end if;
  select h.setlist into v from public.channel_history h where h.code = v_code and h.id = p_id;
  if v is null then return query select 'missing'::text, null::jsonb; return; end if;
  return query select 'ok'::text, v;
end $$;

-- 이름 바꾸기
create or replace function public.host_history_rename(p_code text, p_token text, p_id uuid, p_title text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(p_code); n int;
begin
  if not public._session_ok(v_code, p_token, 'host') then return 'token_rejected'; end if;
  update public.channel_history h set title = btrim(p_title) where h.code = v_code and h.id = p_id;
  get diagnostics n = row_count;
  return case when n = 0 then 'missing' else 'ok' end;
exception when check_violation then return 'invalid';
end $$;

-- 지우기
create or replace function public.host_history_delete(p_code text, p_token text, p_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(p_code); n int;
begin
  if not public._session_ok(v_code, p_token, 'host') then return 'token_rejected'; end if;
  delete from public.channel_history h where h.code = v_code and h.id = p_id;
  get diagnostics n = row_count;
  return case when n = 0 then 'missing' else 'ok' end;
end $$;

revoke all on function public._history_max() from public, anon, authenticated;
revoke all on function public.host_history_save(text, text, text, jsonb, text, int, timestamptz) from public;
revoke all on function public.host_history_list(text, text) from public;
revoke all on function public.host_history_get(text, text, uuid) from public;
revoke all on function public.host_history_rename(text, text, uuid, text) from public;
revoke all on function public.host_history_delete(text, text, uuid) from public;
grant execute on function public.host_history_save(text, text, text, jsonb, text, int, timestamptz) to anon, authenticated;
grant execute on function public.host_history_list(text, text) to anon, authenticated;
grant execute on function public.host_history_get(text, text, uuid) to anon, authenticated;
grant execute on function public.host_history_rename(text, text, uuid, text) to anon, authenticated;
grant execute on function public.host_history_delete(text, text, uuid) to anon, authenticated;
