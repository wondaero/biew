# 진행 상황 · 다음 작업

마지막 갱신: 2026-11-17

## 채널 구조 — 상태

**DB 적용·검증 완료(2026-11-17)**, 코드는 **`feat/channels` 브랜치**. `main` 병합(= 운영 배포)은 사용자 확인 대기.
- 마이그레이션 `20261117000000_channels.sql` 원격 적용(`npx supabase@2 db push --linked`).
- `npm run verify:channels` **37/37 통과** (RLS·비밀번호/토큰·5회 잠금·접속 끊기·보기 비밀번호·삭제·가사 비노출).
- headless Chrome E2E **29/29 통과**, 페이지 오류 0 (스크래치 디렉터리 `e2e/channels.e2e.mjs` — 커밋 안 함):
  홈 로그인 없이 열림 → 새 채널 누를 때 로그인 → 호스트 → 로그아웃 상태 새로고침에도 호스트 유지·폰 재연결 →
  리모컨 비밀번호/틀린 비밀번호/명령/점프/모니터 → 보기(폰·PC 폭) → FREEZE 중 리모컨·보기 고정/해제 →
  리모컨 토큰 재입장 → 관리(그때 로그인) 접속 끊기 → 리모컨 비밀번호 화면 복귀·재입장 → 삭제 → 보기 "없음".

### 남은 일
1. **`feat/channels` → `main` 병합**(사용자 확인 후). 병합 = Vercel 운영 배포. 영향: 옛 `/control` 은 `/` 로, 예전 단일 콘티(`biew.live.v1`)는 옮기지 않음, 로그인 저장 안 됨.
2. 수동 확인(자동화 못 한 것): **"출력 시작" 출력 창**(팝업·두 번째 모니터) 동기, **오프라인 새로고침**(PWA 가 없어 앱 셸 자체가 안 열릴 수 있음 → 아래 다음 작업 1).
3. 병합·안정화 후 `rooms` 테이블/`get_room` 제거 마이그레이션.

### 확정된 설계 (사용자와 합의됨 — 바꾸기 전에 물어볼 것)
- 용어는 **채널**. 계정은 하나. 주소: `/`(로그인 없이 보임) · `/control/:code` · `/output/:code` · `/view/:code`. 번호 없는 옛 주소는 `/` 로.
- **로그인은 저장하지 않는다**(메모리만, `persistSession:false`). 새로고침·탭 닫기 = 로그아웃. ID/PW 는 브라우저 비밀번호 저장으로 자동 입력(앱이 비밀번호 저장 안 함). 예전 버전이 남긴 `sb-*-auth-token` 은 시작 시 지움.
  - 로그인이 필요한 일(그때마다): 채널 만들기, 관리(접속 끊기·비밀번호 변경·삭제), 곡 추가·수정·삭제, 곡 라이브러리 새로 받기, 다른 PC 에서 만든 채널을 이 PC 의 호스트로 등록.
  - 필요 없는 일: 이 PC 의 채널 열기(호스트)·송출·콘티 편집(받아 둔 곡)·출력 설정·FREEZE, 리모컨, 보기.
- **호스트 판정은 로그인이 아니라 이 PC 의 호스트 기록**(`biew.host.<code>` = 제목 + 실시간 주소 topic). 채널을 만들 때(또는 로그인해서 열 때) 기록. 그래서 새로고침·로그아웃·오프라인에도 호스트로 열리고 폰과 다시 연결된다. 홈의 "이 기기의 채널" = 이 기록 목록.
  다른 곳에서 "모든 기기 접속 끊기"를 하면 topic 이 바뀌어 이 PC 의 기록이 무효 → 이 PC 에서 로그인하면 최신 topic 으로 갱신.
- **송출 상태는 DB 에 없다.** 호스트 localStorage `biew.live.v1:<code>` 가 원본. 늦게 들어온 리모컨·보기는 같은 topic 에 `request-state` 를 보내고 호스트가 답한다(0.3초 스로틀). 호스트 PC 가 꺼져 있으면 보기는 "송출 대기 중".
- **컨트롤 비밀번호(필수)**: 폰 리모컨. 송출 조작만(◀▶·곡 이동·슬라이드 점프·BLANK). 곡·콘티·스타일 수정, FREEZE, 채널 관리 불가.
- **보기 비밀번호(선택)**: 없으면 번호만 알면 누구나.
- 리모컨/보기는 기기 토큰 저장(채널별·종류별) → 같은 브라우저는 재입력 불필요. **마지막 사용 후 30일 만료**, "모든 기기 접속 끊기"로 즉시 무효. 기기별 개별 끊기 없음.
- 비밀번호는 bcrypt 해시만. 실패는 `status` 로 응답(예외면 실패 카운트가 롤백되므로), **5회 실패 시 60초 잠금**. 최소 4자(6자 이상 권장 — 올릴지 미정).
- 실시간: topic 이 곧 권한. 호스트 = control topic(명령 수신·상태 송신·요청 응답) + view topic(상태 송신·요청 응답). 리모컨 = control topic 만(view topic 은 보는 기기가 위조 가능하므로 안 씀). 보기 = view topic. 명령은 호스트가 `live/commands.ts` 로 검사(허용 목록+범위) 후 적용.
- 송출은 항상 호스트 PC 를 거친다. 호스트↔출력 창은 BroadcastChannel `biew-live:<code>` → 인터넷이 끊겨도 동작, 리모컨·보기만 멈춘다.

### 알려진 한계 (인지된 것)
- 보기 topic(비밀번호 없는 채널이면 번호)을 아는 기기끼리는 서로 가짜 상태를 보낼 수 있음(다른 보기 화면만 영향. 송출·리모컨 무관).
- 리모컨은 호스트 PC 가 꺼져 있어도 알 수 없다(명령이 조용히 사라짐). "연결됨" 은 리모컨 자신의 연결. 필요하면 호스트 하트비트로 "PC 응답 없음".
- 같은 채널을 두 PC 에서 호스트로 열면 서로 상태를 주고받지 않는다(각자 자기 콘티). 호스트는 한 PC 로 운용.
- 출력 여백이 오른쪽·아래 0(사용자 결정) → 외곽선·그림자가 가장자리에서 잘리거나 프로젝터 오버스캔에 먹힐 수 있음.
- 번호를 아는 누군가 일부러 비밀번호를 틀려 잠금을 걸 수 있음(토큰이 있는 기기는 영향 없음).
- 리모컨은 FREEZE·PVW 없음. 보기의 FREEZE 반영은 인덱스 기준이라 freeze 중 콘티 재배치 시 목록 하이라이트가 어긋날 수 있음(송출 화면은 텍스트 스냅샷이라 정확).
- 새 PC 는 곡 라이브러리를 받으려면 한 번 로그인해야 함(이후 받아 둔 곡은 로그인 없이 사용).

---

## 환경 / 리소스
| 항목 | 값 |
|---|---|
| GitHub | `wondaero/biew` (main 에 push → Vercel 자동 배포) |
| 배포 | https://biew.vercel.app (`/`, `/control/:code`, `/output/:code`, `/view/:code`) |
| Supabase | 프로젝트 `jesusville's Project`, ref `bgfkodbfgjhsauwqhviq`, 리전 서울(ap-northeast-2), Free |
| Vercel 환경변수 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(publishable) 두 개만 |
| 스태프 계정 | 대시보드 Authentication → Users 에서 생성(공개 가입 차단됨). 계정은 하나만 쓴다 |
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
- `SUPABASE_SERVICE_ROLE_KEY` = 같은 화면의 **secret** 키(또는 Legacy 탭의 service_role). import·staff·verify 스크립트에만 필요. 웹앱 개발만 하면 없어도 됨.

Supabase CLI 작업(마이그레이션 등)이 필요하면:
```bash
supabase login            # 새 계정 쪽으로 로그인(기존 계정 세션 주의 — 시크릿 창 or --token)
supabase link --project-ref bgfkodbfgjhsauwqhviq
supabase migration list --linked
supabase db push          # config push 아님!
# CLI 3.x 는 config.toml 의 [inbucket] 때문에 거부함 → npx supabase@2 ... 로 실행(config.toml 은 손대지 않음)
```
가사 원본(.gcg 폴더)은 git 에 없다. 재import 가 필요할 때만 USB 등으로 복사(`doc/` 아래에 두면 자동으로 git 제외).
`.env` 가 없어도 앱은 뜨지만 Supabase 가 `null` 이라 로그인·곡 동기화·채널 기능이 모두 안 된다(UI 확인만 가능).

## 완료된 것
- [x] **1-A 가져오기**: `npm run import` — .gcg 파싱(Python 기준 파서와 1069곡 해시 일치), source_file upsert, `--dry-run`, 요약(0슬라이드/실패 목록). 파일명 UTF-8/CP949 판별 + NFC 정규화.
- [x] **DB**: songs(unique source_file, 내용 변경시에만 updated_at, deleted_at, RLS authenticated), 공개 회원가입 차단.
- [x] **1-D 상태/동기화**: LiveState, SyncTransport/SyncHub, BroadcastChannelTransport, version 순서 보장.
- [x] **1-C 출력**: 자동 글자 축소(최소 20%, 10줄), 컷/페이드, 커서 숨김, Wake Lock, 새로고침 복구. **여백은 위·왼쪽만, 글은 왼쪽 위에서 시작**.
- [x] **1-B 컨트롤러**: 로그인, IndexedDB 캐시 + 델타 동기화, 제목/가사 검색, 콘티(추가/삭제/드래그), 슬라이드 그리드(곡별 아코디언), 즉시/PVW 모드, 단축키, 출력 설정, 두 번째 모니터 출력창.
- [x] **곡 편집기**: 추가/수정/소프트삭제, 빈 줄 = 슬라이드, 실시간 미리보기, 콘티 "↻ 최신".
- [x] **모바일 컨트롤러 레이아웃(≤768px)**: 모니터 + 한 줄 스크롤 슬라이드 목록, 검색/콘티/출력설정은 바텀시트.
- [x] **FREEZE**: F 로 걸기(해제는 버튼만). 송출은 걸 때 화면(텍스트 스냅샷) 유지, 컨트롤러는 계속 조작.
- [x] **채널 구조**(DB 적용·자동 검증 37/37·브라우저 E2E 29/29, main 병합 대기): 홈(`/`), ControlGate(호스트/리모컨 분기), 채널별 출력/뷰어, 비밀번호 입장, 📡 채널 팝오버, 접속 끊기, 삭제, 명령 검사.

## 다음 작업 (우선순위순)
0. **위 "남은 일"** — main 병합(운영 배포), 출력 창·오프라인 수동 확인
1. **PWA(서비스워커)** — 완료 기준 "오프라인에서 전부 동작" 미충족. 지금은 인터넷 끊긴 상태에서 페이지를 **새로고침하면 앱이 안 열림**(호스트 localStorage 복구 로직은 있어도 앱 셸 자체를 못 받음). `vite-plugin-pwa` 로 앱 셸 precache, 출력 창 포함.
2. **방송실 PC 폰트** — 실제 설치 폰트 확인 후 기본 폰트/목록 조정. 오프라인 대비 웹폰트 대신 설치 폰트 or 로컬 번들.
3. **슬라이드 0개 23곡** — GenCG 에서 직접 열어 원인 확인(바이트 조사: 텍스트 레코드 없음, 배경 전용 or 글자 이미지). 필요하면 편집기로 가사 입력.
4. **채널 정리**: 오래된 채널 자동 삭제(현재는 직접 삭제), 구 `rooms`/`get_room` 제거.
5. **편집기 개선(선택)**: 미리보기에서 슬라이드 복제/드래그 순서 변경, 후렴 반복 입력 편의.
6. **초성 검색(선택)**: "ㅈㄴㅇ" — 사용자 결정 대기.
7. **RLS 좁히기(선택)**: `authenticated` → `app_metadata.role = 'staff'`. (`npm run staff` 로 만든 계정에는 role 이 붙음, 대시보드로 만든 계정엔 없음 → 전환 시 기존 계정에 role 부여 필요)
8. **Phase 3 성경 구절**: `verses(version, book, chapter, verse, text)`, "요 3:16-18" 입력 → 자동 분할 + 출처. 개역한글만(개역개정은 허가 전 금지).

## 알려진 이슈 / 메모
- Supabase 대시보드 Users 의 "10 users (estimated)" 는 통계 추정치. 실제 계정 수는 SQL 로 확인.
- 2026-11-16 `supabase config push` 사고: 의도치 않게 auth 설정이 한 번 적용됐다가 복구됨. diff 앞부분만 확인했으므로 SMS/외부 Provider 쪽에 바뀐 값이 있었는지는 미확인 — 대시보드에서 Email 외 Provider 가 꺼져 있는지 점검 권장.
- localStorage 는 도메인별 → localhost 와 biew.vercel.app 의 콘티는 별개.
- 출력 배경 초록(크로마키)/검정(루마키)은 ATEM 키 방식에 맞춰 선택.
- 여백 조절 요청이 오면 CLAUDE.md "출력 여백 · 정렬" 섹션대로 수정(기본값 + 이미 저장된 설정이 우선한다는 점 주의).
