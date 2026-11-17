-- realtime.send(공개 채널, private=false)는 realtime.messages 에 기록은 되지만 공개 구독자에게 전달되지 않았다(검증으로 확인).
-- DB 발 알림은 비공개(인증) 채널용 — 비로그인 폰에 인증을 붙이는 대신, 변경 알림은 '변경한 클라이언트'가 직접 보낸다.
-- 받는 쪽: 호스트 PC 는 알림을 믿지 않고 서버(host_join)에서 다시 읽는다. 보기·리모컨은 화면 표시에만 쓴다.
-- 쓸모없는 기록이 쌓이지 않도록 _broadcast_state 를 아무것도 하지 않게 바꾼다(호출부는 그대로).
create or replace function public._broadcast_state(p_code text, p_state jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  return;
end $$;
revoke all on function public._broadcast_state(text, jsonb) from public, anon, authenticated;
