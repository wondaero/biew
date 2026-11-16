-- 곡 원본 테이블
create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slides      jsonb not null check (jsonb_typeof(slides) = 'array'),
  source_file text unique,                 -- import upsert 키
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                  -- 소프트 삭제(델타 동기화가 삭제를 감지하도록)
);

-- 델타 동기화: where updated_at > :last order by updated_at
create index if not exists songs_updated_at_idx on public.songs (updated_at);

-- 내용이 실제로 바뀐 경우에만 updated_at 갱신.
-- (같은 파일 재import 시 1000여 곡이 전부 "변경됨"으로 잡혀 전 클라이언트가 재다운로드하는 것 방지)
create or replace function public.songs_touch_updated_at()
returns trigger language plpgsql as $$
begin
  if (new.title, new.slides, new.deleted_at) is distinct from (old.title, old.slides, old.deleted_at) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists songs_touch_updated_at on public.songs;
create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.songs_touch_updated_at();

-- RLS: 로그인한 스태프만 읽기/쓰기. (service_role 은 RLS 우회 → import 스크립트)
alter table public.songs enable row level security;

drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated using (true);
drop policy if exists songs_insert on public.songs;
create policy songs_insert on public.songs for insert to authenticated with check (true);
drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs for update to authenticated using (true) with check (true);
-- delete 정책 없음: 삭제는 deleted_at 으로만.
