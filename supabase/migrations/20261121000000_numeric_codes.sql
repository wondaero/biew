-- 채널 번호를 숫자 6자리로(사용자 결정 2026-11-21): 폰 숫자 키패드로 바로 입력, 소리 내어 불러 주기 쉬움.
-- 예전 번호(영문 대문자+숫자 6자, A-Z2-9)로 만든 채널은 그대로 동작한다(형식 검사가 두 가지를 모두 허용).
--
-- 인지된 위험(사용자 결정 A): 경우의 수 8.9억 → 100만. 보기 비밀번호가 없는 채널은 번호가 곧 열쇠라
-- 스크립트로 전부 대입하면 찾아 들어올 수 있다 = "비밀번호 없는 채널은 사실상 공개". 번호가 있는 채널은 이렇게 찾아낼 수 있고,
-- 리모컨은 컨트롤 비밀번호로 막지만 서버 잠금이 없어(사용자 결정 B) 짧은 비밀번호는 대입으로 뚫릴 수 있다 — 공개 목록 채널처럼 길게 권장.
--
-- ⚠️ 배포 순서: 숫자 번호를 받아 주는 앱(api.isCode)이 먼저 배포된 뒤에 적용할 것.
--    옛 앱은 숫자 번호를 '잘못된 채널 번호'로 거부한다.

alter table public.channels drop constraint if exists channels_code_check;
alter table public.channels add constraint channels_code_check check (code ~ '^([0-9]{6}|[A-Z2-9]{6})$');

create or replace function public.create_channel(p_title text, p_control_password text, p_view_password text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code  text;
  v_bytes bytea;
  v_b     int;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  p_title := btrim(coalesce(p_title, ''));
  if char_length(p_title) not between 1 and 60 then raise exception 'invalid title'; end if;
  if p_control_password is null or char_length(p_control_password) < 4 then raise exception 'control password too short'; end if;
  if p_view_password = '' then p_view_password := null; end if;
  if p_view_password is not null and char_length(p_view_password) < 4 then raise exception 'view password too short'; end if;

  -- 숫자 6자리. 바이트 0~249 만 써서(250 = 10의 배수) 자리마다 0~9 가 고르게 나오게 한다(250~255 는 버림)
  loop
    v_bytes := extensions.gen_random_bytes(16);
    v_code := '';
    for i in 0..15 loop
      v_b := get_byte(v_bytes, i);
      if v_b < 250 then v_code := v_code || (v_b % 10)::text; end if;
      exit when char_length(v_code) = 6;
    end loop;
    continue when char_length(v_code) < 6;
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

-- create or replace 는 권한을 유지하지만, 명시해 둔다(원래 마이그레이션과 같게)
revoke all on function public.create_channel(text, text, text) from public, anon;
grant execute on function public.create_channel(text, text, text) to authenticated;
