-- 공개 채널 목록(로그인 불필요): 보기 비밀번호가 있는 채널만, 최근 7일 안에 사용된 것만(사용자 결정).
-- 보기 비밀번호가 없는 채널은 번호가 곧 입장 열쇠라 목록에 올리지 않는다 — QR·링크·번호로 아는 사람만.
-- '사용' = channels.updated_at(만들기·송출 상태 올리기·리모컨 명령·비밀번호 변경 때 갱신).
create or replace function public.list_public_channels()
returns table (code text, title text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.code, c.title, c.updated_at
  from public.channels c join public.channel_secrets s on s.code = c.code
  where s.view_hash is not null and c.updated_at > now() - interval '7 days'
  order by c.updated_at desc
  limit 100
$$;

revoke all on function public.list_public_channels() from public;
grant execute on function public.list_public_channels() to anon, authenticated;
