# Biew — 교회 예배 가사 자막 웹앱 (GenCG 대체)

방송실 담당자가 예배 중 **수동으로** 가사 자막을 송출하는 앱. 인도자가 후렴 반복·되돌아가기를 자주 하므로 **원하는 슬라이드로 바로 점프**가 핵심.
송출 방식 2가지: **로컬 송출** `/local`(예배용 기본 — 이 PC 하나, 서버·인터넷 없음, 다른 기기 접근 불가) / **인터넷 송출** = 채널(**숫자 6자리** 번호, 예전 채널은 영문 6자): `/`(로컬 송출·곡 다운로드·채널 만들기·목록·번호 입력) → `/:code/control`(호스트 PC 또는 폰 리모컨=컨트롤 비밀번호) · `/output/:code`(전체화면 → 빔/ATEM, 버튼이 여는 내부 주소) · `/:code`(보기, 비밀번호 선택). 예전 번호는 `/control/:code`·`/view/:code`. 주소는 반드시 `api.viewPath()`/`controlPath()` 로 만들 것.
PC 한 대 듀얼모니터: 왼쪽 = 호스트 컨트롤러, 오른쪽 = 출력.

- 원래 명세: [docs/SPEC.md](docs/SPEC.md)
- 진행 상황 · 다음 할 일 · 새 컴퓨터 세팅: [docs/PROGRESS.md](docs/PROGRESS.md) ← **세션 시작 시 먼저 읽을 것**
- 로컬 송출·인터넷 송출(채널)·PWA 는 `main` 에 병합되어 운영 배포됨(2026-11-17). 상태는 PROGRESS.md 맨 위. main 에 push = Vercel 운영 배포이므로 큰 변경은 브랜치(미리보기, Vercel 로그인 보호)에서 확인 후 병합.

## ⚠️ 절대 규칙
- **가사는 저작권 데이터.** 개발/디버깅 중 가사 본문을 콘솔·로그·답변·스크린샷에 출력하지 않는다. 검증은 글자 수/줄 수/슬라이드 수/해시 같은 구조 정보만. 브라우저 확인은 Lorem ipsum 더미 선곡으로.
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
npm run verify:channels                     # 실제 DB 검증(RLS·비밀번호/토큰·상태·리모컨 명령=nav 대조 등, 임시 계정·Lorem 채널, 끝나면 삭제)
npx supabase@2 projects api-keys --project-ref bgfkodbfgjhsauwqhviq -o json | node scripts/make-env.mjs   # .env 만들기(키 값 출력 안 함, 먼저 npx supabase@2 login)
```

## 구조
```
shared/            브라우저·Node 공용 순수 TS
  types.ts         Song, SetlistItem, OutputStyle, LiveState, isNewer/nextVersion
  gcg/parse.ts     .gcg 파서 (doc/gcg_parse.py 기준, 1069곡 해시 일치 검증됨)
  slidesText.ts    편집기 텍스트 ↔ 슬라이드(빈 줄 = 구분)
  songCompare.ts   곡 중복 판정(가사 === / 제목 ===, 보이지 않는 차이만 통일)
  outputStyle.ts   normalizeStyle(출력 설정 정규화·예전 값 이전 — 상태·저장된 설정·가져온 파일 공용)
scripts/           import.ts, create-staff.ts, make-fixture.ts
src/sync/          SyncTransport 인터페이스, BroadcastChannelTransport, SupabaseRealtimeTransport, SyncHub(version 필터)
src/live/          liveStore(채널 하나를 연 동안의 상태 소유, commit 단일 경로. host/remote 역할), nav(이동·onAir — 서버 `_apply_command` 와 같은 규칙), persistence(채널별 localStorage·호스트/방문 기록·옛 키 정리)
src/channel/       api(채널 RPC·기기 토큰 저장), sync(호스트/리모컨 Realtime 연결)
src/home/          홈(`/`): HomeView 하나(모든 기기 — 위쪽 버튼 + 채널 카드 그리드·탭, 좁으면 CSS 로 1열. 폰·태블릿은 번호 입력칸 맨 위, 로컬 송출·곡 다운로드 숨김) · useHome(데이터·동작)
src/library/       IndexedDB(이 기기: 받아 둔 DB 곡 songs + 이 기기 변경 pending), DB 와 통째로 비교(diffIndex)·골라 받기/전체 받기·업로드(pending.ts 분류), 검색
src/components/    SlideRender/FitText — 출력·미리보기 공용 렌더러(cqh 단위, 자동 축소)
src/control/       ControlGate(호스트/리모컨 분기·비밀번호 입력), LocalView(/local 오프라인 모드), ControlView, panels/*, SongEditor, UploadDialog, 단축키, 출력창 열기
src/pwa.ts         서비스 워커 등록·새 버전 알림(UpdateBanner)·영구 저장 요청
src/output/        출력 화면(보기 전용, Wake Lock, 복구)
src/viewer/        폰 뷰어(로그인 불필요)
supabase/migrations/  songs, channels(+ live_state·kick_remotes·public_channels·cleanup). rooms(옛 폰 공유)는 삭제됨
```

## 핵심 설계 (바꾸기 전에 이유 확인)
- **상태 모델 `LiveState`** = `{version, origin, setlist, itemIndex, slideIndex, blank, style}`. 모든 변경은 `liveStore.commit()` → version 증가 → localStorage 저장 → BroadcastChannel 전송 → (공유 중이면) Realtime 전송.
- **version** = `max(prev+1, Date.now())`. 컨트롤러 재시작 후에도 단조 증가. 동률이면 origin 사전순(`isNewer`). 수신 측은 더 새 것만 반영.
- **출력 복구**: 출력 창은 localStorage 마지막 상태로 즉시 그림 → `request-state` → 컨트롤러가 스냅샷 응답.
- **선곡 항목은 슬라이드 스냅샷**(곡 추가 시 복사). 예배 중 DB 수정이 송출 번호를 흔들지 않게. 최신화는 선곡의 "↻ 최신" 버튼으로만.
- **선곡 순서 변경 시** 송출 중 곡을 `key` 로 추적해 itemIndex 보정. 송출 중 곡 삭제 → blank.
- **인터넷 송출 = 서버가 상태의 원본**(`channels.state`, 자세한 확정 설계는 PROGRESS.md 맨 위). PC 는 화면을 먼저 바꾸고 `host_set_state` 로 올림 — 인터넷이 끊기면 PC 혼자 계속(dirty), 다시 연결되면 PC 기준으로 덮어씀(force). 리모컨 명령은 서버가 검사·적용(`remote_command`/`_apply_command` = 앱 `nav.ts` 규칙, 바꾸면 둘 다 바꾸고 `verify:channels` 대조 통과 확인). PC 가 꺼져도 리모컨·보기 동작.
- **로그인 아이디**: 아이디만 입력하면 `@jv.jv` 를 붙인다(`shared/loginId.ts` `LOGIN_DOMAIN`, `@` 가 있으면 그대로). `npm run staff -- <아이디>` 도 같은 규칙. 스태프 계정은 이 도메인으로 만들 것.
- **로그인은 이 기기(localStorage)에 저장**(`persistSession:true`, 2026-11-18 사용자 결정 — 스태프 계정이 하나라 방송실 PC 사용자는 어차피 비밀번호를 앎. 계정을 사람마다 나누면 재검토). 홈 머리에 "아이디 로그인됨 · 로그아웃" 상시 표시. **로그인돼 있어도 컨트롤 링크를 연 기기가 자동으로 호스트가 되지 않는다** — ControlGate 가 호스트/리모컨을 묻고, 홈 "내 계정의 채널"(`?as=host`)만 바로 호스트. 인터넷 송출 호스트 PC 권한 = 채널 전용 **호스트 토큰**(`biew.host.<code>`, 로그인 아님) → 새로고침·오프라인에도 호스트. 비밀번호는 bcrypt 해시만, 리모컨·보기는 기기 토큰. 비밀번호 실패 잠금은 **기기(브라우저)별**(서버 잠금 없음 — 사용자 결정).
- **로그인 = 공용 팝업 하나**(`src/lib/loginPrompt.ts` `requireLogin(이유)` → `components/LoginDialog.vue`, App.vue 에 하나). 화면에 로그인 칸을 끼워 넣지 말 것 — 로그인이 필요한 버튼에서 `await requireLogin('…하려면 로그인하세요')` 후 이어서 동작. 다른 팝업 위에 겹쳐 뜨고(z-index 70), 열린 동안 송출 단축키 막음(닫으면 열기 전 상태로 — 출력 설정 팝업 위에서 닫혀도 단축키가 켜지지 않게). PC = 가운데 창, 모바일 = 아래 시트. Esc·뒤로가기·✕ = 취소(false).
- **실시간 알림은 변경한 쪽(PC/리모컨)이 직접 보낸다**(DB 발 `realtime.send` 공개 알림은 전달 안 됨 — 검증). **호스트 PC 는 알림 내용을 믿지 말고 서버에서 다시 읽을 것**(리모컨도 같은 주소에 보낼 수 있음). 리모컨은 control 주소에서만 상태를 받는다. 보기 기기·호스트 PC 는 주소가 바뀌면(리모컨 쫓아내기·보기 비밀번호 변경) 다시 연결(호스트는 30초마다 확인).
- **채널 관리는 호스트 PC 를 끊지 않는다**: "모든 기기 접속 끊기" 없음. 리모컨 쫓아내기 = 컨트롤 비밀번호 변경(새 비밀번호 필수), 보기 비밀번호 설정·변경·없애기. PC 분실 = 채널 삭제. **삭제는 로그인만으로**(기기 무관, 홈 "내 계정의 채널"의 삭제 버튼). 쓰던 채널이 지워진 호스트 PC 는 `hostDeleted` 로 재시도 없이 "삭제됨" 표시(송출은 계속).
- 송출은 항상 호스트 PC 를 거친다. 호스트↔출력 창은 BroadcastChannel `biew-live:<code>` 라 인터넷이 끊겨도 동작.
- **songs.updated_at 트리거**는 내용이 바뀐 경우에만 갱신(재import 시 전 기기 재다운로드 방지). 삭제는 `deleted_at` 소프트 삭제(델타 동기화가 삭제를 알 수 있게).
- 다운로드 목록은 델타가 아니라 **DB 전체 목록(id·updated_at·deleted_at)과 이 기기를 통째로 비교**(`diffIndex`) — 건너뛴 항목이 다음에 다시 나오고, DB 에서 완전히 사라진 유령 곡도 잡힌다. 가사는 다른 곡만 받는다.
- 연속 중복 슬라이드는 의도된 것 — 지우지 않는다.
- 색: `--live`(초록) = 송출 중, `--preview`(파랑 점선) = PVW 선택, 노랑 = BLANK 전용, `--freeze`(하늘색) = FREEZE 전용, 빨강 = 오류/삭제만. (src/style.css)
- **버튼 = 3D, 뱃지·입력칸과 구분**(2026-11-18, src/style.css): 버튼은 위가 밝은 면 + 받침(box-shadow, 색 `--edge`, 높이 `--lift` = 글자 크기 비례). 받침을 두꺼운 아래 테두리로 하면 아래 모서리 둥글기가 어긋나므로 쓰지 말 것. 색은 `background-color` 만 바꿀 것(면 그라데이션 유지). 평평한 글자형 버튼(✕·✎)은 `box-shadow: none; margin: 0` 필요. 단계: 기본 · `.primary` · `.danger` · `.danger-line`(확인창 거치는 위험 동작) · `.quiet`. 송출(TAKE)은 초록. 입력칸은 반대로 파인 모양(`--field`). 뱃지는 평평.
- 기호 ◀ ▶ 는 Windows 가 이모지로 그릴 수 있음 → 뒤에 `&#xFE0E;`(글자로 그리기). 디자인 비교 스크린샷은 `node scripts/e2e/shot-control.mjs <이름>`.
- **FREEZE**(단축키 F 는 **걸기만**, 해제는 버튼 클릭으로만 — 가사 수정 중 실수로 풀리는 것 방지): `LiveState.frozen` = 걸 때의 송출 위치 + **텍스트 스냅샷**. 컨트롤러 이동/BLANK 는 그대로 동작하지만 출력·뷰어·PGM 모니터는 `nav.onAir(state)`(freeze 중이면 스냅샷)를 그린다. 해제하면 컨트롤러의 현재 위치가 바로 송출. 목적: 예배 중 오타 발견 시 송출은 유지한 채 가사 수정. 송출을 그리는 곳은 `currentText(state)` 대신 반드시 `onAir()` 를 쓸 것. 컨트롤러가 freeze 중 가리키는 위치는 SlideGrid 에서 파란 점선(`.ctl`).
- 즉시 모드: 카드 클릭 = 송출, 그리드엔 송출 중만 표시. PVW 모드: 클릭 = 미리보기, Enter/TAKE = 송출.
- **슬라이드 한 장 고치기 = 카드의 ✎**(2026-11-18 사용자 결정, `SlideEditDialog.vue` + 규칙 `src/control/slideEdit.ts`): 예배 중 오타용. 저장 = 선곡 즉시(`live.setlist.editSlides` — 장 수·위치 그대로, 송출 중 장이면 바로 나감, FREEZE 중이면 풀 때) + **곡 원본에도**(기본 켜짐, 끄면 오늘만). 원본은 통째로 덮지 않고 **그 글만** 바꿔 `saveSong` 규칙대로(서버/PC) — 어느 장인지 모르면(그 사이 바뀜) 원본은 건드리지 않고 경고. 같은 글이 여러 장(후렴)이면 "모두" 기본 켜짐. **빈 줄 = 그 자리에서 장 나누기**(2026-11-19 — 현장에서 쪼개기·뒤에 장 추가, 나뉜 장마다 미리보기). 장 수가 바뀌면 송출·FREEZE·미리보기 위치를 같은 글로 옮긴다(`remapIndex`: 앞을 나누면 늘어난 만큼 뒤로, 송출 중인 장·뒤를 나누면 그대로 — 그 장 자체면 나눈 첫 장). 장 삭제는 없음. ✎ 는 카드 밖 형제 버튼(카드 클릭 = 송출), PC 는 마우스 올릴 때만, 폰은 항상. 호스트만. E2E `e2e:slideedit`.
- 모달(편집기) 열린 동안 `hotkeysPaused` 로 송출 단축키 중지.
- **뒤로가기 = 팝업 닫기**(`src/lib/backClose.ts` `useBackClose(isOpen, request)`): 팝업이 열리면 같은 주소로 히스토리 칸을 쌓고, 뒤로가기는 맨 위 팝업에 닫기를 요청(거절하면 칸을 다시 쌓음). 새 팝업·시트를 만들면 반드시 연결할 것(안 하면 모바일 뒤로가기가 페이지를 나감). 처리 중엔 request 에서 무시. E2E `e2e:back`.
- **버튼은 보통 크기(14px, 기본 여백)**(2026-11-19 사용자 요청 — 작은 버튼 없애기). 버튼은 부모 글자 크기를 따라가므로(`font: inherit`) 12px 패널 안에선 `font-size: 14px` 를 명시. 줄일 필요가 있으면 문구를 줄일 것.
- 송출 모니터(PGM 화면)를 누르면 가사 목록이 송출 중인 장으로 스크롤(`SlideGrid.scrollToLive`, 송출은 안 바뀜).
- **폰 출력 설정 슬라이더 안전장치**(`StylePanel` `touch-guard`, 폰 출력 설정 화면만): 터치 화면(hover 없음)에서 슬라이더는 평소 터치를 안 받고(그 위를 끌면 스크롤), 그 줄을 **탭**해 켠 것만 조절. 스크롤하거나 다른 곳을 탭하면 꺼짐. 켜기를 pointerdown 으로 하면 스크롤 동작에서도 켜지므로 click 으로. E2E `e2e:ui`.
- 세그먼트(고르기) 버튼의 선택 상태는 제자리 + 안쪽 그림자 — 내리면(translate) 받침이 안 보이는 어두운 패널에서 옆 버튼보다 처져 보인다.
- **저장된 출력 설정(프리셋)** = `src/live/stylePresets.ts`, localStorage `biew.stylePresets.v1` 하나(채널 무관). **서버에 절대 올리지 않는다**(사용자 결정). 옮기기·백업은 JSON 파일 내보내기/가져오기. 불러오기는 수정본으로(적용을 눌러야 송출). 목록 상자 항상 표시, 파일 내보내기/가져오기는 "백업·다른 PC 로 옮기기" 안에 접힘. OutputStyle 필드를 바꾸면 `shared/outputStyle.ts` 의 `normalizeStyle` 도 같이.
- **출력 설정 = 수정본 → 적용**(2026-11-18 사용자 결정, `src/live/styleDraft.ts`): 설정을 바꾸면 수정본만 바뀌고 **[적용]을 눌러야 송출**. 기준 = 지금 송출 중 설정(되돌리기 = 수정본 버림 — PC 패널은 늘 열려 있어 "연 시점" 기준은 애매하므로). 시트를 닫아도 수정본 유지(하단 "⚙ 출력 설정 •"), 새로고침·채널 이동 시 사라짐(메모리만). 적용 직후 "방금 적용 취소" 한 단계. **적용 ≠ 저장**(저장 = 이름 붙여 보관, 지금 보이는 설정). **PC 는 출력 설정 = 팝업**(`StyleDialog.vue`, 사이드바 설정 한 줄의 "⚙ 설정" — 왼쪽 = 보는 곳(큰 적용 전 미리보기 + 지금 송출 중 비교), 오른쪽 = 만지는 곳(설정 + 아래 고정 줄 [기본값으로] … [되돌리기][적용])). 열린 동안 송출 단축키 막고 팝업 단축키만: Esc 닫기(수정본 유지)·Ctrl/⌘+Enter 적용(그냥 Enter 는 이름 입력 중 실수 방지로 안 씀). 모바일은 전체 화면(위쪽 고정 미리보기 — 고친 내용이 있으면 [적용 전 | 송출 중] 전환으로 같은 자리·같은 크기 비교. 시트가 뒤의 송출 화면을 가리고, 나란히 두면 폰에서 글자를 못 읽어서). ≤768px 이면 시트, 아니면 팝업 — 둘 중 하나만 그린다(둘 다 그리면 설정 패널이 두 벌). FREEZE 는 글만 고정 — 설정은 적용하면 바로 나간다. 설정 패널에서 `live.setStyle` 을 직접 부르지 말 것.
- **PWA**: 앱 파일 전체 precache, 새 버전은 **알림 후 적용**(자동 교체 금지 — 예배 중 화면이 바뀌면 안 됨). 알림은 /output 에 절대 띄우지 않는다. Supabase 요청은 캐시하지 않는다.
- **로컬 송출 `/local`** = 채널 없는 PC 전용 송출(`LOCAL_CODE`). 예배의 기본. 서버 기능을 여기에 섞지 말 것. 선곡은 그날 하루 임시 — 송출 방식 간 선곡 가져오기·보관 기능은 만들지 않기로 함.
- **곡 저장 = 이 기기, DB 는 버튼으로만**(2026-11-19 사용자 결정, `src/library/library.ts`): 저장·삭제는 언제나 이 기기(pending: new/edit/delete, 인터넷·로그인 불필요, 선곡·검색에 바로). 곡 목록(과 홈 곡 카드)의 **[⬇ 다운로드]·[⬆ 업로드]**(항상 보임, 숫자 = 받을 것/올릴 것)를 누를 때 **비밀번호 재확인**(`requireReauth` — 아이디 채워 둠, 같은 탭에서 5분 안이면 생략, 세션 변경 watch 로 통과시키지 말 것 — 토큰 갱신에도 바뀜) → 목록 화면에선 다시 안 물음. 다운로드(`DownloadDialog`): DB 와 다른 곡(새 곡·수정·삭제) + 어디가 다른지(`shared/songDiff.ts`, 장·줄·글자) → 골라 받기 / **전체 받기**(이 기기의 곡·변경을 모두 지우고 DB 로 교체, 확인창). 이 기기에서도 바꾼 곡(충돌)은 기본 선택 안 함. 업로드(`UploadDialog`): 이 기기 변경마다 중복·충돌(DB 기준) 검사, 전체 선택, 충돌은 직접 고름. 충돌 없는 수정·삭제는 `updated_at = base` 조건부. **전체 업로드(DB 를 이 기기로 교체)는 보류**(이 기기에 없는 다른 기기 곡까지 지움). 컨트롤러·홈을 열면 비교만(숫자), 받은 곡이 없는 기기는 로그인돼 있으면 전체를 바로 받음. 로그아웃은 홈에만. E2E `e2e:sync`.

## 출력 여백 · 정렬 (사용자가 나중에 수치 조절을 요청하면 바로 여기를 수정)
- **여백은 위·왼쪽만 쓴다.** 오른쪽·아래는 화면 끝까지(넘치면 글자 축소). 글은 왼쪽 정렬, (왼쪽 여백, 위 여백)에서 시작하고 줄이 늘면 아래로 자란다. 가운데 정렬/하단 기준으로 되돌리지 말 것.
- 값: `OutputStyle.topMargin`(cqh, 기본 5), `leftMargin`(cqw, 기본 5) — 기본값은 `shared/types.ts` 의 `DEFAULT_STYLE`.
- 적용 위치: `src/components/FitText.vue` 의 `boxStyle`(top/left/bottom/right). 슬라이더 UI: `src/control/panels/StylePanel.vue`("위 여백"/"왼쪽 여백").
- 기본값을 바꿔도 **이미 저장된 설정(localStorage `biew.live.v1`)이 우선**한다. 모든 기기에 새 기본값을 강제하려면 `src/live/persistence.ts` 의 `loadLive` 에 마이그레이션을 추가하거나, 사용자에게 "기본값으로" 버튼을 안내한다.
- 글자 자동 축소 최소 배율 `MIN_SCALE = 0.2`(FitText.vue) — 최대 10줄까지 한 화면에 들어가도록. 슬라이드 카드도 같은 규칙(`v-fit-lines`, src/components/fitLines.ts): 원래 줄바꿈 그대로 두고 긴 줄이 있으면 그 카드 글자만 줄임(최소 55%, 그래도 넘치면 아래를 흐리게 자르고 마우스 올리면 전체). 자간은 줄이지 않음. 폰 보기(/view) 가사 목록은 일부러 꺾는다(폰에서 읽기 좋게). E2E `e2e:cards`.
- **송출 글꼴 Pretendard 는 앱에 포함**(`src/style.css` `@font-face`, `font-display: block`, PWA precache — `vite.config.ts` 의 woff2·`maximumFileSizeToCacheInBytes` 를 지우지 말 것 — 기본 2MiB 한도에 걸리면 조용히 빠져 오프라인에서 다른 글꼴로 나온다). FitText 는 글꼴 로드(`loadingdone`) 후 다시 맞춘다.
- `position`: `'top'`(기본) / `'center'`(세로 중앙). 예전 저장값 `'bottom'` 은 `'top'` 으로 이전된다.
- 같은 렌더러(`SlideRender`/`FitText`)를 출력·컨트롤러 모니터·카드 미리보기·폰 뷰어가 공유하므로 한 곳 수정이 전부에 반영된다.

## 컨트롤러 배치 (2026-11-18 사용자 결정 — 메인은 핵심만, 자잘한 건 팝업)
- **PC 2단**: 사이드바(왼쪽 320px) = 송출 화면(+PVW 모드면 미리보기 화면) → 출력 설정 한 줄(`StyleSummary`, 송출 중 설정과 같은 저장된 설정 이름 표시) → [🔍 곡 검색 /][+ 새 곡] → 선곡(남는 높이 전부). 가운데 = 슬라이드 목록. 오른쪽 패널 없음.
- **곡 목록 = 팝업**(이름 "곡 목록", 2026-11-19. `SearchDialog.vue`, 안에 `LibraryPanel` 전체 — 검색·추가·동기화·새 곡·서버 올리기). `/` 로 열고 검색칸 커서 → ↑↓ Enter = 선곡에 추가(열린 채 연달아) → Esc 검색어 지움 → Esc 닫기. **곡 누르기 = 보기·수정(편집기), 선곡 추가는 오른쪽 [+ 선곡] 또는 Enter**(사용자 결정 — 잘못 눌러 선곡에 들어가지 않게). 추가하면 "선곡 N번째로 추가" 알림(뒤의 선곡이 안 보이므로). 사이드바 "+ 새 곡" = 같은 팝업 + 편집기 바로.
- 팝업이 겹치므로 송출 단축키 막기는 `usePauseHotkeys()`(닫을 때 열기 전 상태로 — 무조건 false 로 풀면 안쪽 팝업 닫을 때 바깥 팝업 아래에서 단축키가 살아남).

## 모바일 컨트롤러 (≤768px, CSS 미디어쿼리)
- **배치(2026-11-19 사용자 결정 — 자주 누르는 건 엄지 자리)**: 위부터 상단 바(Biew·채널 / [미리보기 후 송출][송출 종료][🌐 또는 📡 채널]) → 준비 버튼 줄 `.dock`(곡 목록 팝업 · 선곡 · 출력 설정 — 예배 전에 맞추고 거의 안 씀) → 송출 모니터(사이드바의 모니터만 보임) → 슬라이드 목록(곡별 아코디언, 접힌 곡 헤더에도 "● 송출 중 n/m" 표시, 1열 행 목록) → **맨 아래 송출 버튼 `TransportBar`(bottom)** 한 줄, 아이콘만, 모두 같은 폭(▶ 만 넓게 했다가 오류처럼 보인다고 사용자가 되돌림): [BLANK][FREEZE][◀][▶] — ▶ 를 엄지 자리 오른쪽 끝에, 바로 옆은 ◀(잘못 눌러도 한 장 뒤로), BLANK·FREEZE 는 왼쪽으로 떨어뜨림. 리모컨은 [BLANK][◀][▶]. 아이콘은 직접 그린 SVG(BLANK = 눈에 빗금, FREEZE = 눈꽃 — 문자 ❄ 는 기기마다 컬러 이모지가 될 수 있음), 켜짐은 채운 색. PC 는 아이콘 + 글자("❄ FREEZE"). FREEZE 켜짐 = 버튼 안에서만 눈송이 4개가 천천히 내림(`FreezeSnow.vue` — 걸어 둔 걸 잊지 않게 하는 신호. 송출·보기 화면엔 넣지 말 것, 동작 줄이기 설정이면 숨김). 폰 아이콘 아래 작은 글자는 보류(사용자 결정). 송출 버튼은 PC = 상단 바 안, 폰 = 맨 아래 — `narrow`(matchMedia) 로 둘 중 하나만 그린다. 컴포넌트를 복제하지 않고 같은 DOM 을 CSS 로 재배치한다(`ControlView.vue` 하단 스타일).
- 모바일에선 출력 시작·출력 연결 표시·📱 폰·`?` 를 숨긴다(`desk-only`).
- **가장 좁은 기준 = 280px**(접는 폰, 사용자가 실제로 씀). 화면을 바꾸면 `npm run e2e:narrow`(화면별 가로 넘침 자동 점검 + out/e2e/w280-*.png). grid 는 `minmax(0, 1fr)` 로(기본값은 긴 내용이 열을 넓혀 넘침), 고정 폭(min-width)은 좁은 화면에서 풀 것. 곡 편집기는 ≤768px 에서 위 가사 · 아래 미리보기 가로 한 줄.
- **폰 = 전체 화면 팝업**(2026-11-19 사용자 결정 — 92% 바텀시트는 위 틈만 애매하게 남았다): 내용이 많은 작업 화면(곡 목록·곡 편집기·서버 올리기·슬라이드 수정·선곡·출력 설정)은 ≤768px 에서 화면 전체 — 팝업 상자에 `class="m-full"`(src/style.css). 머리 아래 `OnAirStrip`("● 송출 중: 곡명 n/m" — 전체 화면이 송출 모니터를 가리므로). 짧은 확인·입력(로그인·인터넷 송출 전환 등)은 작은 창/아래 시트 그대로. 팝업 머리는 두 줄(위 = 제목 + 평평한 ✕, 아래 = 부제목 …) — 머리에 flex-wrap 을 걸면 긴 부제목이 머리 폭을 늘려 ✕ 가 화면 밖으로 밀린다(겪음).
- **기기 종류(폰·태블릿 vs PC) 판단은 화면 폭이 아니라 `isMobileOS()`(src/lib/device.ts, OS 기준)**. pointer:coarse 는 터치 노트북을 모바일로 잘못 잡으므로 쓰지 않는다. 판정은 경고·배치용이고 기능을 막지 않는다.
- 넓은 화면 `/view` 는 송출 화면(`onStage`) — 새 UI 를 띄울 때 `/output` 과 마찬가지로 여기에도 뜨지 않게 할 것.

## 작업 방식
- 새 컴퓨터에서 이어서 할 때는 PROGRESS.md "새 컴퓨터에서 이어서 작업하기" 순서대로(.env → link → 확인 명령).
- 배포 확인: 홈 하단 "버전 (빌드 시각) · (커밋)". 브라우저는 앱 파일을 저장(PWA)해서 새로고침만으론 새 버전이 안 열린다 — "새 버전 있음 — 적용" 또는 모든 Biew 탭을 닫고 다시 열기.
- 변경 후 `npm run typecheck && npm test && npm run build` 통과 확인.
- UI 확인은 브라우저 E2E(`scripts/e2e/`, `npm run e2e` 또는 `e2e:<이름>`). 새 확인이 필요하면 같은 방식으로 스크립트를 추가: Lorem 선곡을 localStorage `biew.live.v1:<코드>`(로컬은 `:LOCAL`)에 심고, 로그인 필요 기능은 service_role 로 임시 스태프 계정 생성 → 테스트 → 삭제. 공용 도우미 `scripts/e2e/_lib.mjs`(경로·Chrome·서버 자동).
- 커밋 메시지는 영어, 본문에 이유. main 에 push 하면 Vercel 자동 배포.
- 사용자는 한국어로 소통. 실무 권장 방식과 이유를 함께 설명하고 더 나은 구조가 있으면 먼저 제안.

## 함정
- **Vue scoped 스타일은 자식 컴포넌트의 최상위 요소에도 걸린다.** 부모에 `.backdrop { display:none }` 같은 범용 이름을 두면 같은 이름의 자식 대화창이 통째로 숨는다(겪음 — 인터넷 송출 전환 창). 부모 쪽은 접두사(`sheet-`)를 붙일 것.
- 가려진(백그라운드) 탭은 브라우저가 타이머를 늦춘다 → 주기 확인(호스트 10초 주소 확인 등)이 늦어질 수 있음. E2E 에서 해당 탭을 `bringToFront()` 할 것.
- 송출 배경은 `style.backdrop`(shared/backdrop.ts). 예전 `style.background` 는 normalizeLive 가 이전하고 지운다. ATEM 키잉은 검정·초록 단색만 가능.
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
