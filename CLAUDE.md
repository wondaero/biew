# Biew — 교회 예배 가사 자막 웹앱 (GenCG 대체)

방송실 담당자가 예배 중 **수동으로** 가사 자막을 송출하는 앱. 인도자가 후렴 반복·되돌아가기를 자주 하므로 **원하는 슬라이드로 바로 점프**가 핵심.
송출 방식 2가지: **로컬 송출** `/local`(예배용 기본 — 이 PC 하나, 서버·인터넷 없음, 다른 기기 접근 불가) / **인터넷 송출** = 채널(6자 번호): `/`(로컬 송출·곡 다운로드·채널 만들기·목록·번호 입력) → `/control/:code`(호스트 PC 또는 폰 리모컨=컨트롤 비밀번호) · `/output/:code`(전체화면 → 빔/ATEM) · `/view/:code`(보기, 비밀번호 선택).
PC 한 대 듀얼모니터: 왼쪽 = 호스트 컨트롤러, 오른쪽 = 출력.

- 원래 명세: [docs/SPEC.md](docs/SPEC.md)
- 진행 상황 · 다음 할 일 · 새 컴퓨터 세팅: [docs/PROGRESS.md](docs/PROGRESS.md) ← **세션 시작 시 먼저 읽을 것**
- 로컬 송출·인터넷 송출(채널)·PWA 는 `main` 에 병합되어 운영 배포됨(2026-11-17). 상태는 PROGRESS.md 맨 위. main 에 push = Vercel 운영 배포이므로 큰 변경은 브랜치(미리보기, Vercel 로그인 보호)에서 확인 후 병합.

## ⚠️ 절대 규칙
- **가사는 저작권 데이터.** 개발/디버깅 중 가사 본문을 콘솔·로그·답변·스크린샷에 출력하지 않는다. 검증은 글자 수/줄 수/슬라이드 수/해시 같은 구조 정보만. 브라우저 확인은 Lorem ipsum 더미 콘티로.
- 테스트·샘플 데이터는 Lorem ipsum 등 더미 텍스트만.
- `doc/<가사폴더>/`, `*.gcg`, `out/` 은 git 제외(.gitignore). 절대 커밋 금지.
- **service_role 키는 `.env` 에만.** 이름에 `VITE_` 접두사 금지(번들 유출). Vercel 환경변수에도 넣지 않는다. 키 값을 출력하지 말 것.
- 출력은 **인터넷이 끊겨도 멈추면 안 된다.** 같은 PC 창 간 동기화는 BroadcastChannel, 네트워크 기능(Realtime/DB)은 실패해도 로컬 송출에 영향 없게.

## 스택 / 실행
Vite + Vue 3 + TypeScript · Supabase(Postgres/Auth/Realtime) · IndexedDB(idb) · Vercel 배포. **Node 22** (`nvm use`, .nvmrc).

```bash
npm run dev            # http://localhost:5173/control
npm test               # vitest
npm run typecheck      # vue-tsc
npm run build
npm run import -- "<gcg폴더>" [--dry-run]   # .gcg → songs upsert (key: source_file)
npm run staff -- <email>                    # 스태프 계정 생성(비번 숨김 입력) — 일반 터미널에서
npm run verify:channels                     # 채널 마이그레이션 적용 후 RLS/비밀번호/토큰/잠금 자동 검증(임시 계정·Lorem 채널, 끝나면 삭제)
```

## 구조
```
shared/            브라우저·Node 공용 순수 TS
  types.ts         Song, SetlistItem, OutputStyle, LiveState, isNewer/nextVersion
  gcg/parse.ts     .gcg 파서 (doc/gcg_parse.py 기준, 1069곡 해시 일치 검증됨)
  slidesText.ts    편집기 텍스트 ↔ 슬라이드(빈 줄 = 구분)
  songCompare.ts   곡 중복 판정(가사 === / 제목 ===, 보이지 않는 차이만 통일)
scripts/           import.ts, create-staff.ts, make-fixture.ts
src/sync/          SyncTransport 인터페이스, BroadcastChannelTransport, SupabaseRealtimeTransport, SyncHub(version 필터)
src/live/          liveStore(채널 하나를 연 동안의 상태 소유, commit 단일 경로. host/remote 역할), nav(이동·onAir), commands(리모컨 명령 검사), persistence(채널별 localStorage)
src/channel/       api(채널 RPC·기기 토큰 저장), sync(호스트/리모컨 Realtime 연결)
src/home/          채널 만들기·목록·번호 입력(`/`)
src/library/       IndexedDB 캐시(songs·pending), updated_at 델타 동기화, 검색, saveSong(오프라인이면 PC 에 저장)/deleteSong(온라인만), 서버에 올리기(pending.ts 분류)
src/components/    SlideRender/FitText — 출력·미리보기 공용 렌더러(cqh 단위, 자동 축소)
src/control/       ControlGate(호스트/리모컨 분기·비밀번호 입력), LocalView(/local 오프라인 모드), ControlView, panels/*, SongEditor, UploadDialog, 단축키, 출력창 열기
src/pwa.ts         서비스 워커 등록·새 버전 알림(UpdateBanner)·영구 저장 요청
src/output/        출력 화면(보기 전용, Wake Lock, 복구)
src/viewer/        폰 뷰어(로그인 불필요)
supabase/migrations/  songs, rooms(구), channels
```

## 핵심 설계 (바꾸기 전에 이유 확인)
- **상태 모델 `LiveState`** = `{version, origin, setlist, itemIndex, slideIndex, blank, style}`. 모든 변경은 `liveStore.commit()` → version 증가 → localStorage 저장 → BroadcastChannel 전송 → (공유 중이면) Realtime 전송.
- **version** = `max(prev+1, Date.now())`. 컨트롤러 재시작 후에도 단조 증가. 동률이면 origin 사전순(`isNewer`). 수신 측은 더 새 것만 반영.
- **출력 복구**: 출력 창은 localStorage 마지막 상태로 즉시 그림 → `request-state` → 컨트롤러가 스냅샷 응답.
- **콘티 항목은 슬라이드 스냅샷**(곡 추가 시 복사). 예배 중 DB 수정이 송출 번호를 흔들지 않게. 최신화는 콘티의 "↻ 최신" 버튼으로만.
- **콘티 순서 변경 시** 송출 중 곡을 `key` 로 추적해 itemIndex 보정. 송출 중 곡 삭제 → blank.
- **인터넷 송출 = 서버가 상태의 원본**(`channels.state`, 자세한 확정 설계는 PROGRESS.md 맨 위). PC 는 화면을 먼저 바꾸고 `host_set_state` 로 올림 — 인터넷이 끊기면 PC 혼자 계속(dirty), 다시 연결되면 PC 기준으로 덮어씀(force). 리모컨 명령은 서버가 검사·적용(`remote_command`/`_apply_command` = 앱 `nav.ts` 규칙, 바꾸면 둘 다 바꾸고 `verify:channels` 대조 통과 확인). PC 가 꺼져도 리모컨·보기 동작.
- **로그인은 저장하지 않는다**(`persistSession:false`). 인터넷 송출 호스트 PC 권한 = 채널 전용 **호스트 토큰**(`biew.host.<code>`, 로그인 아님) → 새로고침·오프라인에도 호스트. 비밀번호는 bcrypt 해시만, 리모컨·보기는 기기 토큰. 비밀번호 실패 잠금은 **기기(브라우저)별**(서버 잠금 없음 — 사용자 결정).
- **실시간 알림은 변경한 쪽(PC/리모컨)이 직접 보낸다**(DB 발 `realtime.send` 공개 알림은 전달 안 됨 — 검증). **호스트 PC 는 알림 내용을 믿지 말고 서버에서 다시 읽을 것**(리모컨도 같은 주소에 보낼 수 있음). 리모컨은 control 주소에서만 상태를 받는다. 보기 기기·호스트 PC 는 주소가 바뀌면(리모컨 쫓아내기·보기 비밀번호 변경) 다시 연결(호스트는 30초마다 확인).
- **채널 관리는 호스트 PC 를 끊지 않는다**: "모든 기기 접속 끊기" 없음. 리모컨 쫓아내기 = 컨트롤 비밀번호 변경(새 비밀번호 필수), 보기 비밀번호 설정·변경·없애기. PC 분실 = 채널 삭제.
- 송출은 항상 호스트 PC 를 거친다. 호스트↔출력 창은 BroadcastChannel `biew-live:<code>` 라 인터넷이 끊겨도 동작.
- **songs.updated_at 트리거**는 내용이 바뀐 경우에만 갱신(재import 시 전 기기 재다운로드 방지). 삭제는 `deleted_at` 소프트 삭제(델타 동기화가 삭제를 알 수 있게).
- 델타 동기화는 `updated_at >= lastSync`(gte, 멱등). 단건 저장은 lastSync 를 건드리지 않는다.
- 연속 중복 슬라이드는 의도된 것 — 지우지 않는다.
- 색: `--live`(초록) = 송출 중, `--preview`(파랑 점선) = PVW 선택, 노랑 = BLANK 전용, `--freeze`(하늘색) = FREEZE 전용, 빨강 = 오류/삭제만. (src/style.css)
- **FREEZE**(단축키 F 는 **걸기만**, 해제는 버튼 클릭으로만 — 가사 수정 중 실수로 풀리는 것 방지): `LiveState.frozen` = 걸 때의 송출 위치 + **텍스트 스냅샷**. 컨트롤러 이동/BLANK 는 그대로 동작하지만 출력·뷰어·PGM 모니터는 `nav.onAir(state)`(freeze 중이면 스냅샷)를 그린다. 해제하면 컨트롤러의 현재 위치가 바로 송출. 목적: 예배 중 오타 발견 시 송출은 유지한 채 가사 수정. 송출을 그리는 곳은 `currentText(state)` 대신 반드시 `onAir()` 를 쓸 것. 컨트롤러가 freeze 중 가리키는 위치는 SlideGrid 에서 파란 점선(`.ctl`).
- 즉시 모드: 카드 클릭 = 송출, 그리드엔 송출 중만 표시. PVW 모드: 클릭 = 미리보기, Enter/TAKE = 송출.
- 모달(편집기) 열린 동안 `hotkeysPaused` 로 송출 단축키 중지.
- **PWA**: 앱 파일 전체 precache, 새 버전은 **알림 후 적용**(자동 교체 금지 — 예배 중 화면이 바뀌면 안 됨). 알림은 /output 에 절대 띄우지 않는다. Supabase 요청은 캐시하지 않는다.
- **로컬 송출 `/local`** = 채널 없는 PC 전용 송출(`LOCAL_CODE`). 예배의 기본. 서버 기능을 여기에 섞지 말 것. 콘티는 그날 하루 임시 — 송출 방식 간 콘티 가져오기·보관 기능은 만들지 않기로 함.
- **곡 저장 규칙**: 온라인+로그인이면 서버에 바로, 아니면 PC(pending). 이미 pending 이 있는 곡은 온라인이어도 PC 에 이어서 저장(충돌 검사를 거쳐야 하므로). 서버에 올리기 전에 반드시 동기화 후 중복(새 곡)·충돌(수정, base.updated_at 비교) 검사. 삭제는 온라인만.

## 출력 여백 · 정렬 (사용자가 나중에 수치 조절을 요청하면 바로 여기를 수정)
- **여백은 위·왼쪽만 쓴다.** 오른쪽·아래는 화면 끝까지(넘치면 글자 축소). 글은 왼쪽 정렬, (왼쪽 여백, 위 여백)에서 시작하고 줄이 늘면 아래로 자란다. 가운데 정렬/하단 기준으로 되돌리지 말 것.
- 값: `OutputStyle.topMargin`(cqh, 기본 5), `leftMargin`(cqw, 기본 5) — 기본값은 `shared/types.ts` 의 `DEFAULT_STYLE`.
- 적용 위치: `src/components/FitText.vue` 의 `boxStyle`(top/left/bottom/right). 슬라이더 UI: `src/control/panels/StylePanel.vue`("위 여백"/"왼쪽 여백").
- 기본값을 바꿔도 **이미 저장된 설정(localStorage `biew.live.v1`)이 우선**한다. 모든 기기에 새 기본값을 강제하려면 `src/live/persistence.ts` 의 `loadLive` 에 마이그레이션을 추가하거나, 사용자에게 "기본값으로" 버튼을 안내한다.
- 글자 자동 축소 최소 배율 `MIN_SCALE = 0.2`(FitText.vue) — 최대 10줄까지 한 화면에 들어가도록. 슬라이드 카드 미리보기 줄 제한도 10줄(SlideGrid.vue).
- `position`: `'top'`(기본) / `'center'`(세로 중앙). 예전 저장값 `'bottom'` 은 `'top'` 으로 이전된다.
- 같은 렌더러(`SlideRender`/`FitText`)를 출력·컨트롤러 모니터·카드 미리보기·폰 뷰어가 공유하므로 한 곳 수정이 전부에 반영된다.

## 모바일 컨트롤러 (≤768px, CSS 미디어쿼리)
- 위: 상단 바 → 송출 모니터 → 슬라이드 목록(곡별 아코디언, 접힌 곡 헤더에도 "● 송출 중 n/m" 표시, 1열 행 목록). 아래 도크 버튼 3개(곡 검색/콘티/출력 설정)가 바텀시트를 연다. 컴포넌트를 복제하지 않고 같은 DOM 을 CSS 로 재배치한다(`ControlView.vue` 하단 스타일).
- 모바일에선 출력 시작·출력 연결 표시·📱 폰·`?` 를 숨긴다(`desk-only`).

## 작업 방식
- 변경 후 `npm run typecheck && npm test && npm run build` 통과 확인.
- UI 확인은 headless Chrome(puppeteer-core, 스크래치 디렉터리에 설치)으로 Lorem 콘티를 localStorage `biew.live.v1` 에 심어서. 로그인 필요 기능은 service_role 로 임시 스태프 계정 생성 → 테스트 → 계정 삭제.
- 커밋 메시지는 영어, 본문에 이유. main 에 push 하면 Vercel 자동 배포.
- 사용자는 한국어로 소통. 실무 권장 방식과 이유를 함께 설명하고 더 나은 구조가 있으면 먼저 제안.

## 함정
- 서비스 워커는 **배포용 빌드에서만** 동작(dev 서버는 꺼져 있음). 오프라인 확인은 `npm run build` 후 `vite preview` 로, 서버를 실제로 꺼서.
- puppeteer: 다른 탭을 연 뒤 뒤로 간 탭은 렌더링이 멈춰 `locator().click()` 이 무한 대기 → `bringToFront()` 후 `page.click()`.
- 테스트로 만든 곡은 **완전 삭제 말고 `deleted_at` 으로** 정리(완전 삭제하면 그 사이 곡을 받은 기기가 삭제를 모른다).
- `supabase config push` 는 **확인 프롬프트에 n 을 넣어도 적용된다**(겪음). 원격 auth 설정 변경은 대시보드에서 하거나, 로컬 config.toml 을 원격 값과 정확히 맞춘 뒤에만.
- `supabase projects api-keys` 는 새 `secret` 키를 마스킹해서 준다 → import 용으로는 레거시 `service_role` 사용 중. `.env` 는 이 출력에서 값을 화면에 내지 않고 바로 파일로 기록할 것.
- Supabase CLI 3.x 는 config.toml 의 `[inbucket]` 때문에 실행을 거부한다 → `npx supabase@2 ...` 로 실행(config.toml 을 고치지 말 것 — config push 사고와 얽힘).
- supabase-js 는 같은 이름으로 `channel()` 을 부르면 기존 인스턴스를 돌려준다 → 정리는 `removeChannel` 로(`unsubscribe` 만 하면 재구독 예외).
- supabase-js 최신은 Node 22+ 필요(Node 20 에서 WebSocket 오류).
- `crypto.randomUUID` 는 http(LAN IP)에서 없음 → `src/lib/uid.ts` 의 `uid()` 사용.
- Window Management API(두 번째 모니터 배치)는 Chrome/Edge 전용. 전체화면은 출력 창 안에서 클릭 1번 필요.
- Vercel SPA 새로고침 404 → `vercel.json` rewrite 로 해결됨.
