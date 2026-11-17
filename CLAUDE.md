# Biew — 교회 예배 가사 자막 웹앱 (GenCG 대체)

방송실 담당자가 예배 중 **수동으로** 가사 자막을 송출하는 앱. 인도자가 후렴 반복·되돌아가기를 자주 하므로 **원하는 슬라이드로 바로 점프**가 핵심.
PC 한 대 듀얼모니터: 왼쪽 = 컨트롤러(`/control`), 오른쪽 = 출력(`/output`, 전체화면 → 빔/ATEM). 폰은 `/view/:code` 로 보기.

- 원래 명세: [docs/SPEC.md](docs/SPEC.md)
- 진행 상황 · 다음 할 일 · 새 컴퓨터 세팅: [docs/PROGRESS.md](docs/PROGRESS.md) ← **세션 시작 시 먼저 읽을 것**

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
npm test               # vitest (32개)
npm run typecheck      # vue-tsc
npm run build
npm run import -- "<gcg폴더>" [--dry-run]   # .gcg → songs upsert (key: source_file)
npm run staff -- <email>                    # 스태프 계정 생성(비번 숨김 입력) — 일반 터미널에서
```

## 구조
```
shared/            브라우저·Node 공용 순수 TS
  types.ts         Song, SetlistItem, OutputStyle, LiveState, isNewer/nextVersion
  gcg/parse.ts     .gcg 파서 (doc/gcg_parse.py 기준, 1069곡 해시 일치 검증됨)
  slidesText.ts    편집기 텍스트 ↔ 슬라이드(빈 줄 = 구분)
scripts/           import.ts, create-staff.ts, make-fixture.ts
src/sync/          SyncTransport 인터페이스, BroadcastChannelTransport, SupabaseRealtimeTransport, SyncHub(version 필터)
src/live/          liveStore(컨트롤러 상태 소유, commit 단일 경로), nav(이동 로직), persistence(localStorage), share(폰 공유)
src/library/       IndexedDB 캐시, updated_at 델타 동기화, 검색, saveSong/deleteSong
src/components/    SlideRender/FitText — 출력·미리보기 공용 렌더러(cqh 단위, 자동 축소)
src/control/       컨트롤러 화면, panels/*, SongEditor, 단축키, 출력창 열기
src/output/        출력 화면(보기 전용, Wake Lock, 복구)
src/viewer/        폰 뷰어(로그인 불필요)
supabase/migrations/  songs, rooms
```

## 핵심 설계 (바꾸기 전에 이유 확인)
- **상태 모델 `LiveState`** = `{version, origin, setlist, itemIndex, slideIndex, blank, style}`. 모든 변경은 `liveStore.commit()` → version 증가 → localStorage 저장 → BroadcastChannel 전송 → (공유 중이면) Realtime 전송.
- **version** = `max(prev+1, Date.now())`. 컨트롤러 재시작 후에도 단조 증가. 동률이면 origin 사전순(`isNewer`). 수신 측은 더 새 것만 반영.
- **출력 복구**: 출력 창은 localStorage 마지막 상태로 즉시 그림 → `request-state` → 컨트롤러가 스냅샷 응답.
- **콘티 항목은 슬라이드 스냅샷**(곡 추가 시 복사). 예배 중 DB 수정이 송출 번호를 흔들지 않게. 최신화는 콘티의 "↻ 최신" 버튼으로만.
- **콘티 순서 변경 시** 송출 중 곡을 `key` 로 추적해 itemIndex 보정. 송출 중 곡 삭제 → blank.
- **폰 공유 보안**: 컨트롤러는 Realtime **송신 전용**(수신 안 함) → 가짜 상태가 송출에 못 들어옴. 뷰어(anon)는 `rooms` 직접 조회 불가, `get_room(code)` RPC 로 정확한 코드 한 방만.
- **songs.updated_at 트리거**는 내용이 바뀐 경우에만 갱신(재import 시 전 기기 재다운로드 방지). 삭제는 `deleted_at` 소프트 삭제(델타 동기화가 삭제를 알 수 있게).
- 델타 동기화는 `updated_at >= lastSync`(gte, 멱등). 단건 저장은 lastSync 를 건드리지 않는다.
- 연속 중복 슬라이드는 의도된 것 — 지우지 않는다.
- 색: `--live`(초록) = 송출 중, `--preview`(파랑 점선) = PVW 선택, 노랑 = BLANK 전용, 빨강 = 오류/삭제만. (src/style.css)
- 즉시 모드: 카드 클릭 = 송출, 그리드엔 송출 중만 표시. PVW 모드: 클릭 = 미리보기, Enter/TAKE = 송출.
- 모달(편집기) 열린 동안 `hotkeysPaused` 로 송출 단축키 중지.

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
- `supabase config push` 는 **확인 프롬프트에 n 을 넣어도 적용된다**(겪음). 원격 auth 설정 변경은 대시보드에서 하거나, 로컬 config.toml 을 원격 값과 정확히 맞춘 뒤에만.
- `supabase projects api-keys` 는 새 `secret` 키를 마스킹해서 준다 → import 용으로는 레거시 `service_role` 사용 중.
- supabase-js 최신은 Node 22+ 필요(Node 20 에서 WebSocket 오류).
- `crypto.randomUUID` 는 http(LAN IP)에서 없음 → `src/lib/uid.ts` 의 `uid()` 사용.
- Window Management API(두 번째 모니터 배치)는 Chrome/Edge 전용. 전체화면은 출력 창 안에서 클릭 1번 필요.
- Vercel SPA 새로고침 404 → `vercel.json` rewrite 로 해결됨.
