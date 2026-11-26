-- 선곡 기록: [저장](불러온 기록에 덮어쓰기) / [다른 이름으로 저장](새 기록) — 2026-11-26 사용자 결정.
--  - 자동 기록을 없앴으므로 저장은 모두 사람이 누른 것 → 같은 선곡이어도 새로 남길 수 있게(p_allow_dup).
--    옛 앱(아직 새 버전 적용 전)은 p_allow_dup 없이 부르므로 기본값 false = 예전처럼 '가장 최근과 같으면 건너뜀'.
--  - 덮어쓰기는 호스트 토큰으로만, 이름은 그대로 두고 선곡·지문·그림 수·저장 시각만 바꾼다.

drop function if exists public.host_history_save(text, text, text, jsonb, text, int, timestamptz);
create or replace function public.host_history_save(p_code text, p_token text, p_title text, p_setlist jsonb, p_fingerprint text, p_skipped int, p_saved_at timestamptz default null, p_allow_dup boolean default false)
returns table (status text, id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); v_last text; v_id uuid; v_at timestamptz;
begin
  if not exists (select 1 from public.channels c where c.code = v_code) then return query select 'not_found'::text, null::uuid; return; end if;
  if not public._session_ok(v_code, p_token, 'host') then return query select 'token_rejected'::text, null::uuid; return; end if;
  if not coalesce(p_allow_dup, false) then
    select h.fingerprint into v_last from public.channel_history h where h.code = v_code order by h.saved_at desc limit 1;
    if v_last = p_fingerprint then return query select 'dup'::text, null::uuid; return; end if;
  end if;
  v_at := case when p_saved_at is null or p_saved_at > now() + interval '1 day' or p_saved_at < now() - interval '400 days' then now() else p_saved_at end;
  insert into public.channel_history (code, title, saved_at, fingerprint, setlist, skipped_media)
    values (v_code, btrim(p_title), v_at, p_fingerprint, p_setlist, coalesce(p_skipped, 0))
    returning channel_history.id into v_id;
  delete from public.channel_history h where h.code = v_code and h.id in (
    select h2.id from public.channel_history h2 where h2.code = v_code order by h2.saved_at desc offset public._history_max());
  return query select 'ok'::text, v_id;
exception when check_violation then return query select 'invalid'::text, null::uuid;
end $$;

-- 덮어쓰기(불러온 기록에 [저장])
create or replace function public.host_history_update(p_code text, p_token text, p_id uuid, p_setlist jsonb, p_fingerprint text, p_skipped int)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(p_code); n int;
begin
  if not public._session_ok(v_code, p_token, 'host') then return 'token_rejected'; end if;
  update public.channel_history h
    set setlist = p_setlist, fingerprint = p_fingerprint, skipped_media = coalesce(p_skipped, 0), saved_at = now()
    where h.code = v_code and h.id = p_id;
  get diagnostics n = row_count;
  return case when n = 0 then 'missing' else 'ok' end;
exception when check_violation then return 'invalid';
end $$;

revoke all on function public.host_history_save(text, text, text, jsonb, text, int, timestamptz, boolean) from public;
revoke all on function public.host_history_update(text, text, uuid, jsonb, text, int) from public;
grant execute on function public.host_history_save(text, text, text, jsonb, text, int, timestamptz, boolean) to anon, authenticated;
grant execute on function public.host_history_update(text, text, uuid, jsonb, text, int) to anon, authenticated;
