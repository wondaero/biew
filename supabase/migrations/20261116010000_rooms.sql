-- 폰 뷰어용 방. 행 하나에 현재 상태를 덮어쓴다(기록 없음).
create table if not exists public.rooms (
  code       text primary key check (code ~ '^[A-Z2-9]{6}$'),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  state      jsonb not null,
  version    bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

-- 스태프: 자기 방만 생성/수정/삭제/조회
drop policy if exists rooms_owner_all on public.rooms;
create policy rooms_owner_all on public.rooms for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- 뷰어(비로그인): 테이블 직접 조회 불가. 코드를 정확히 알 때만 RPC 로 한 방을 읽음 → 방 목록 열람 차단
create or replace function public.get_room(p_code text)
returns table (state jsonb, version bigint)
language sql stable security definer set search_path = '' as $$
  select r.state, r.version from public.rooms r where r.code = upper(p_code)
$$;

revoke all on function public.get_room(text) from public;
grant execute on function public.get_room(text) to anon, authenticated;
