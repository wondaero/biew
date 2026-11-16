# 진행 상황 · 다음 작업

마지막 갱신: 2026-11-17 · 마지막 커밋: `e18ed5d` (main)

## 환경 / 리소스
| 항목 | 값 |
|---|---|
| GitHub | `wondaero/biew` (main 에 push → Vercel 자동 배포) |
| 배포 | https://biew.vercel.app (`/control`, `/output`, `/view/:code`) |
| Supabase | 프로젝트 `jesusville's Project`, ref `bgfkodbfgjhsauwqhviq`, 리전 서울(ap-northeast-2), Free |
| Vercel 환경변수 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(publishable) 두 개만 |
| 스태프 계정 | 대시보드 Authentication → Users 에서 생성(공개 가입 차단됨) |
| 데이터 | songs 1069곡(+ 테스트로 만든 소프트삭제 Lorem 1행), 슬라이드 5713장 |

## 새 컴퓨터에서 시작하기
```bash
git clone https://github.com/wondaero/biew.git && cd biew
nvm install 22 && nvm use
npm install
cp .env.example .env     # 값 채우기 ↓
```
`.env` 값:
- `VITE_SUPABASE_URL` / `SUPABASE_URL` = `https://bgfkodbfgjhsauwqhviq.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = 대시보드 Project Settings → API Keys → **publishable** 키
- `SUPABASE_SERVICE_ROLE_KEY` = 같은 화면의 **secret** 키(또는 Legacy 탭의 service_role). import·staff 스크립트에만 필요. 웹앱 개발만 하면 없어도 됨.

Supabase CLI 작업(마이그레이션 등)이 필요하면:
```bash
supabase login            # 새 계정 쪽으로 로그인(기존 계정 세션 주의 — 시크릿 창 or --token)
supabase link --project-ref bgfkodbfgjhsauwqhviq
supabase migration list --linked
```
가사 원본(.gcg 폴더)은 git 에 없다. 재import 가 필요할 때만 USB 등으로 복사(`doc/` 아래에 두면 자동으로 git 제외).

## 완료된 것
- [x] **1-A 가져오기**: `npm run import` — .gcg 파싱(Python 기준 파서와 1069곡 해시 일치), source_file upsert, `--dry-run`, 요약(0슬라이드/실패 목록). 파일명 UTF-8/CP949 판별 + NFC 정규화.
- [x] **DB**: songs(unique source_file, 내용 변경시에만 updated_at, deleted_at, RLS authenticated), 공개 회원가입 차단.
- [x] **1-D 상태/동기화**: LiveState, SyncTransport/SyncHub, BroadcastChannelTransport, version 순서 보장.
- [x] **1-C 출력**: 자동 글자 축소, 컷/페이드, 커서 숨김, Wake Lock, 새로고침 복구, 숨김 시 페이드 생략.
- [x] **1-B 컨트롤러**: 로그인, IndexedDB 캐시 + 델타 동기화, 제목/가사 검색, 콘티(추가/삭제/드래그), 슬라이드 그리드, 즉시/PVW 모드, 단축키(→/Space ← ↑↓ B 숫자 Enter /), 출력 설정, 두 번째 모니터 출력창, 출력 연결 표시.
- [x] **폰 뷰어(Phase 2 일부)**: rooms 테이블 + get_room RPC, Realtime Broadcast, `/view/:code`, 컨트롤러 📱 폰(방코드/QR/복사/새 코드/종료).
- [x] **곡 편집기**: 추가/수정/소프트삭제, 빈 줄 = 슬라이드, 실시간 미리보기, 커서↔미리보기 연동, 콘티 "↻ 최신".
- [x] UI 조정: 왼쪽 패널 넘침 수정, NEXT 모니터 제거(PVW 모드에서만 PVW), 송출 중 = 초록.

## 다음 작업 (우선순위순)
1. **PWA(서비스워커)** — 완료 기준 "오프라인에서 전부 동작" 미충족 부분. 지금은 인터넷 끊긴 상태에서 페이지를 **새로고침하면 앱이 안 열림**. `vite-plugin-pwa` 로 앱 셸 precache. 출력 창도 포함.
2. **Realtime 비공개 채널** — 지금 `room:<code>` 는 공개 Broadcast 라 방코드를 아는 사람이 **다른 폰들에** 가짜 상태를 보낼 수 있음(송출 화면은 안전). Realtime Authorization(realtime.messages RLS: 송신 = 방 owner 만, 수신 = anon 허용)로 전환.
3. **방송실 PC 폰트** — 실제 설치 폰트 확인 후 기본 폰트/목록 조정. 오프라인 대비 웹폰트 대신 설치 폰트 or 로컬 번들.
4. **슬라이드 0개 23곡** — GenCG 에서 직접 열어 원인 확인(바이트 조사 결과 텍스트 레코드 없음: 배경 전용 or 글자 이미지). 필요하면 편집기로 가사 입력.
5. **Phase 2 나머지 — 폰 조작**: 역할(방장/컨트롤러/뷰어), 제어권 요청→방장 승인, 동시 조작 1명, 방장 즉시 회수. 이때 컨트롤러가 Realtime 을 **수신**하게 되므로 2번(인증된 송신자 검증)이 선행돼야 함.
6. **편집기 개선(선택)**: 미리보기에서 슬라이드 복제/드래그 순서 변경, 후렴 반복 입력 편의.
7. **초성 검색(선택)**: "ㅈㄴㅇ" — 사용자 결정 대기.
8. **RLS 좁히기(선택)**: `authenticated` → `app_metadata.role = 'staff'`. (`npm run staff` 로 만든 계정에는 role 이 붙음, 대시보드로 만든 계정엔 없음 → 전환 시 기존 계정에 role 부여 필요)
9. **Phase 3 성경 구절**: `verses(version, book, chapter, verse, text)`, "요 3:16-18" 입력 → 자동 분할 + 출처. 개역한글만(개역개정은 허가 전 금지).
10. rooms 정리: 오래된 방 자동 삭제(예: updated_at 24시간 경과) — pg_cron 또는 공유 시작 시 정리.

## 알려진 이슈 / 메모
- Supabase 대시보드 Users 의 "10 users (estimated)" 는 통계 추정치. 실제 계정 수는 SQL 로 확인.
- 2026-11-16 `supabase config push` 사고: 의도치 않게 auth 설정이 한 번 적용됐다가 복구됨. diff 앞부분만 확인했으므로 SMS/외부 Provider 쪽에 바뀐 값이 있었는지는 미확인 — 대시보드에서 Email 외 Provider 가 꺼져 있는지 점검 권장.
- localStorage 는 도메인별 → localhost 와 biew.vercel.app 의 콘티는 별개.
- 출력 배경 초록(크로마키)/검정(루마키)은 ATEM 키 방식에 맞춰 선택.
