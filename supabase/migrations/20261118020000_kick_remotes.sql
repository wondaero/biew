-- '모든 기기 접속 끊기'(reset_channel_access)를 없애고 두 가지로 나눈다(사용자 결정).
--  1. 리모컨 쫓아내기 = 컨트롤 비밀번호 변경(새 비밀번호 필수, 기존과 같으면 거부)
--     → 리모컨 입장 토큰 전부 무효 + 리모컨용 실시간 주소(control topic) 재발급.
--       쫓겨난 폰은 다음 버튼 누름부터 서버가 거부. 옛 주소로 엿보기·가짜 알림도 불가.
--  2. 보기 비밀번호 설정/변경/없애기
--     → 설정·변경이면 보기 토큰 무효 + 보기 주소(view topic) 재발급. 없애기면 누구나 번호로 보기(주소 유지).
-- 호스트 PC 토큰은 어느 쪽에서도 지우지 않는다 — 방송실 PC 가 예배 중 다시 로그인할 일이 없게.
-- (PC 를 잃어버렸으면 채널 삭제.) 바뀐 주소는 호스트 PC 가 host_join 으로 받아 다시 연결한다.

drop function if exists public.reset_channel_access(text, text, text, boolean);

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
    control_topic = encode(extensions.gen_random_bytes(16), 'hex'),
    control_fails = 0, control_locked_until = null
  where code = v_code;
  update public.channels set updated_at = now() where code = v_code;
  return query select x.control_topic from public.channel_secrets x where x.code = v_code;
end $$;

-- p_new_view_password: null 또는 '' = 보기 비밀번호 없애기
create or replace function public.set_view_password(p_code text, p_new_view_password text)
returns table (view_topic text, has_view_password boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_code text := upper(p_code); s public.channel_secrets; v_pw text := nullif(p_new_view_password, '');
begin
  if not exists (select 1 from public.channels where code = v_code and owner = auth.uid()) then raise exception 'not found'; end if;
  select * into s from public.channel_secrets where code = v_code;
  if v_pw is null then
    update public.channel_secrets set view_hash = null, view_fails = 0, view_locked_until = null where code = v_code;
    delete from public.channel_sessions where code = v_code and kind = 'view';
  else
    if char_length(v_pw) < 4 then raise exception 'view password too short'; end if;
    if s.view_hash is not null and extensions.crypt(v_pw, s.view_hash) = s.view_hash then raise exception 'same password'; end if;
    delete from public.channel_sessions where code = v_code and kind = 'view';
    update public.channel_secrets set
      view_hash = extensions.crypt(v_pw, extensions.gen_salt('bf')),
      view_topic = encode(extensions.gen_random_bytes(16), 'hex'),
      view_fails = 0, view_locked_until = null
    where code = v_code;
  end if;
  update public.channels set has_view_password = (v_pw is not null), updated_at = now() where code = v_code;
  return query select x.view_topic, (x.view_hash is not null) from public.channel_secrets x where x.code = v_code;
end $$;

revoke all on function public.kick_remotes(text, text) from public, anon;
revoke all on function public.set_view_password(text, text) from public, anon;
grant execute on function public.kick_remotes(text, text) to authenticated;
grant execute on function public.set_view_password(text, text) to authenticated;
