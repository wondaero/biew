# 진행 상황 · 다음 작업

마지막 갱신: 2026-11-17

## 🔴 인계: 채널 구조 — DB 가 되는 컴퓨터에서 AI 가 이어서 할 일

**상황**: 채널 기능(방 목록·채널 만들기·폰 리모컨·보기 비밀번호)의 **코드는 전부 작성**됐지만, 이 코드를 쓴 PC 에는 Supabase CLI·로그인·`.env` 가 없어서
**DB 마이그레이션을 실행해 보지 못했고, 따라서 서버 연동은 한 번도 동작해 본 적이 없다.** 타입체크·단위 테스트(39개)·빌드만 통과.
→ 이 문서를 읽은 AI 는 사용자에게 다시 묻지 말고 아래 순서대로 진행한다. (사용자 승인 사항: 채널 구조, 비밀번호 방식, 폰 권한 — 아래 "확정된 설계" 참고)

### 순서
0. **브랜치**: 이 작업은 `main` 이 아니라 **`feat/channels` 브랜치**에 있다(`git fetch && git checkout feat/channels`).
   **DB 함수가 적용되기 전에 `main` 에 합치거나 push 하면 안 된다** — main push 는 Vercel 자동 배포인데, 새 코드는 `/control` 을 `/` 로 보내고 채널 RPC 를 전제하므로 운영 사이트가 깨진다.
   (브랜치 push 는 Vercel 미리보기 배포만 만든다.) 4번 실검증까지 통과한 뒤 main 에 병합(push → 자동 배포).
1. **환경**: `.env` 채우기(아래 "새 컴퓨터에서 시작하기"), `supabase login` → `supabase link --project-ref bgfkodbfgjhsauwqhviq`.
   (CLI 가 없으면 설치. 대시보드 SQL Editor 에 붙여 실행해도 된다.)
2. **마이그레이션 검토 후 적용**: [supabase/migrations/20261117000000_channels.sql](../supabase/migrations/20261117000000_channels.sql)
   - 적용 전 `supabase migration list --linked` 로 대기 중인 게 이 파일 하나인지 확인.
   - **`supabase db push` 만 사용. `supabase config push` 는 절대 금지**(확인 프롬프트에 n 을 넣어도 적용되는 사고 이력, 아래 "알려진 이슈").
   - 이 SQL 은 **실행해 본 적이 없다.** plpgsql 오류(컬럼/변수 이름 충돌, `#variable_conflict use_column`, `extensions.` 스키마의 pgcrypto, RETURN QUERY 타입 캐스팅 등)가 있을 수 있다. 오류가 나면 파일을 고치고 재적용(이미 일부 적용됐다면 새 마이그레이션 파일로 수정).
3. **자동 검증**: `npm run verify:channels` → 전부 ✔ 여야 한다. (임시 스태프 계정+임시 Lorem 채널을 만들고 끝나면 삭제. 가사/실데이터 무접촉)
   RLS·비밀번호/토큰·5회 잠금·접속 끊기·보기 비밀번호 선택·삭제를 점검한다. 실패하면 SQL 을 고쳐 다시.
4. **브라우저 실검증**(Lorem 더미 콘티, headless Chrome 또는 수동). 체크리스트:
   - [ ] `/` 에서 로그인 → 채널 만들기(제목·컨트롤 비밀번호·보기 비밀번호 선택) → `/control/<번호>` 로 이동, 호스트 UI(검색·콘티·출력설정·FREEZE) 보임
   - [ ] 콘티에 더미 곡 추가 → 📡 채널 팝오버에 번호/QR/링크 표시, 상태가 "● 폰 연결 준비됨"
   - [ ] "출력 시작" → `/output/<번호>` 창이 열리고 컨트롤러와 동기, FREEZE/BLANK 동작
   - [ ] **다른 브라우저 프로필(시크릿)**, 로그인 없이 `/control/<번호>` → 비밀번호 입력 → 리모컨 UI(모니터+슬라이드 목록+◀▶BLANK, 검색/콘티/스타일/FREEZE 없음)
   - [ ] 리모컨에서 ▶, 슬라이드 탭, BLANK → 호스트 컨트롤러와 출력 창이 따라감. 리모컨 새로고침 후 비밀번호 재입력 없이 입장(토큰 저장)
   - [ ] 호스트 📡 → "모든 기기 접속 끊기" → 리모컨이 비밀번호 입력 화면으로 돌아감
   - [ ] `/view/<번호>`: 보기 비밀번호 없으면 번호만으로 / 있으면 비밀번호. 넓은 화면=송출 화면, 폰 폭=가사 목록. FREEZE 중에는 고정 화면을 따라감
   - [ ] 채널 삭제(📡 → 채널 삭제) → `/` 로 이동, 리모컨/뷰어는 "채널을 찾을 수 없습니다"
   - [ ] **오프라인**: 호스트 탭에서 네트워크를 끊고 새로고침 → 호스트로 다시 열리고 송출 정상(출력 창은 BroadcastChannel 로 계속 동작)
   - [ ] 두 번째 호스트 기기에서 같은 채널을 열면 서버 state 를 이어받는지(`adoptState`)
5. **Realtime 확인**: topic 은 공개(Broadcast) 채널 이름 `ch:<추측 불가 토큰>` 으로만 보호된다(private channel/RLS 미사용). 프로젝트의 Realtime 설정에서 공개 채널이 허용돼 있어야 한다(기존 `room:` 방식과 동일 조건).
6. **병합·정리**: 검증이 끝나면 `feat/channels` 를 main 에 병합·push. 프런트가 더 이상 안 쓰는 `rooms` 테이블/`get_room` 제거 마이그레이션 작성(검증 끝난 뒤), 이 문서의 이 섹션을 "완료"로 갱신, 커밋·push(main push → Vercel 자동 배포).

### 확정된 설계 (사용자와 합의됨 — 바꾸기 전에 물어볼 것)
- 용어는 **채널**. 계정은 하나, 여러 기기 동시 로그인 가능. 채널을 만든 계정만 만들기·목록·삭제(삭제 버튼은 채널 화면 안 📡 팝오버).
- 주소: `/`(채널 만들기·목록·번호 입력) · `/control/:code` · `/output/:code` · `/view/:code`. 번호 없는 옛 주소는 `/` 로 리다이렉트.
- **컨트롤 비밀번호(필수)**: 폰 리모컨용. 계정 로그인 없이 채널 번호+비밀번호로 입장, **송출 조작만**(◀▶, 곡 이동, 슬라이드 점프, BLANK). 곡 추가·수정·삭제, 콘티 편집, 출력 스타일, FREEZE, 채널 삭제는 **불가**.
- **보기 비밀번호(선택)**: 없으면 번호만 알면 누구나 보기, 있으면 비밀번호 필요. 컨트롤 비밀번호와 별개.
- 이 기기에 토큰 저장 → 같은 브라우저는 다시 입력 불필요(채널별·종류별). 사이트 데이터 삭제/시크릿/다른 브라우저면 다시 입력. 토큰은 **마지막 사용 후 30일 만료**, 호스트의 "모든 기기 접속 끊기"(또는 비밀번호 변경)로 즉시 무효 + topic 재발급. 기기별 개별 끊기는 없음(필요하면 추후).
- 비밀번호는 bcrypt 해시만 저장. 틀리면 `status` 로 응답(예외를 던지면 실패 카운트가 롤백되므로), **5회 실패 시 60초 잠금**. 최소 길이 4자(6자 이상 권장 — 올릴지 미정).
- 실시간: topic 이 곧 권한(capability). 호스트는 control topic 수신(명령)·view topic 송신(상태), 리모컨은 반대, 보기는 view topic 수신. 호스트가 명령을 `live/commands.ts` 로 검사(허용 목록+범위)한 뒤 적용 → 서버/네트워크가 상태를 직접 바꾸지 못함.
- 송출은 항상 **호스트 PC 를 거친다**. 인터넷이 끊겨도 호스트↔출력 창(BroadcastChannel `biew-live:<code>`)은 계속 동작, 리모컨만 멈춘다. 호스트로 한 번 연 브라우저는 오프라인 새로고침에도 호스트로 열린다(`biew.hosted.<code>`).
- 채널 상태는 호스트 localStorage `biew.live.v1:<code>` 가 원본, 서버 `channels.state` 는 늦게 들어온 기기/다른 호스트 PC 의 초기값(0.4초 디바운스 덮어쓰기).

### 알려진 한계 (인지된 것)
- 보기 토큰을 아는 기기끼리는 서로 가짜 상태를 보낼 수 있음(다른 보기 화면만 영향, 송출·리모컨 명령 경로엔 무관).
- 번호를 아는 누군가 일부러 비밀번호를 틀려 잠금을 걸 수 있음(이미 토큰이 있는 기기는 영향 없음).
- 같은 채널을 호스트로 두 기기에서 동시에 열면(같은 계정) 서로 덮어쓸 수 있음(version/origin 규칙으로 더 새 것이 이김, 별도 제어권 조정 없음).
- 리모컨은 FREEZE 불가, PVW 없음. 곡 검색/콘티 편집 불가(라이브러리가 로그인 필요).
- 보기 화면의 FREEZE 반영은 인덱스 기준이라 freeze 중 콘티를 재배치하면 목록 하이라이트가 어긋날 수 있음(송출 화면 자체는 텍스트 스냅샷이라 정확).

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
- [x] **채널 구조 코드**(위 "인계" — 서버 미검증): 홈(`/`), ControlGate(호스트/리모컨 분기), 채널별 출력/뷰어, 비밀번호 입장, 📡 채널 팝오버, 접속 끊기, 삭제, 명령 검사.

## 다음 작업 (우선순위순)
0. **위 "인계" 섹션 — 마이그레이션 적용·검증·실검증** (이게 끝나야 채널 기능이 실제로 쓸 수 있음)
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
