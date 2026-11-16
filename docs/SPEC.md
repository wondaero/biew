# 원래 명세 (프로젝트 시작 시 요구사항)

> 구현 중 바뀐 결정은 맨 아래 "명세 이후 변경·추가된 결정"에 정리. 현재 상태는 [PROGRESS.md](PROGRESS.md).

## 배경
- 교회 방송실에서 GenCG(Compix Media 자막 CG 프로그램) + ATEM Mini Pro 로 가사 자막 송출 중 → 웹앱으로 대체.
- 사용자는 예배 중 실시간으로 조작하는 방송실 담당자. 자동 진행 없음, 전부 수동.
- 찬양 인도자가 즉석에서 후렴 반복·되돌아가기가 잦음 → 순서대로 넘기기보다 **원하는 슬라이드로 바로 점프**가 핵심.

## 기술 스택
Vite + Vue 3 + TypeScript · Supabase(DB, 이후 Realtime) · 로컬 캐시 IndexedDB

## 확정된 설계 결정
1. PC 한 대 듀얼모니터. 왼쪽 컨트롤러 창, 오른쪽 출력 창(전체화면, 보기 전용 → 빔/ATEM).
2. 같은 PC 두 창은 BroadcastChannel 로 통신. 인터넷이 없어도 출력은 절대 멈추면 안 됨.
3. Supabase 에는 곡 원본만 저장. 그날의 콘티는 DB 에 저장하지 않음.
4. 약 2000곡, 2~4MB. 시작 시 전체 곡을 IndexedDB 에 캐시, 이후 `updated_at` 기준 변경분만. 검색은 클라이언트에서 제목+가사 전체.
5. 슬라이드 텍스트는 `\n` 으로 줄 구분 저장, 출력에서 `white-space: pre-line`.
6. 연속 중복 슬라이드는 의도된 것 → 지우지 않음.

## DB 스키마 (1차)
```sql
songs (
  id uuid pk default gen_random_uuid(),
  title text not null,
  slides jsonb not null,      -- string[]  각 원소 = 슬라이드 1장, 줄은 \n
  source_file text,           -- 원본 .gcg 파일명
  updated_at timestamptz default now()
)
```
RLS: 읽기·쓰기 모두 로그인한 스태프만.

## GenCG(.gcg) 포맷 (분석 완료)
- 암호화 없는 독자 바이너리. `\x13Compix Media, Inc.` 헤더로 시작.
- 앞 약 60KB 는 설치 폰트 이름 목록(CP949) — 무시. 대부분은 비압축 RGB565 배경 비트맵 — 무시.
- 텍스트: 글자 1개 = 10바이트 레코드 `[UTF-16LE 2B][00 00 00 00][01 00 00 00]`
  - `0x000D` = 줄바꿈. 레코드 연속 구간 하나 = 슬라이드 1장. 3개 이상 연속만 텍스트로 인정. 앞뒤 줄바꿈 trim.
- 곡 제목은 파일 내부에 없음 → 파일명 사용. Windows 파일명 CP949 한글 깨짐 처리.
- 참고 파서: `doc/gcg_parse.py` (기준 구현).

## 작업 규칙
- 가사는 저작권 데이터. 가사 본문을 콘솔/로그/답변에 출력 금지. 검증은 글자 수·줄 수·슬라이드 수 같은 구조 정보만.
- 테스트·샘플은 Lorem ipsum 더미.
- service_role 키는 `.env` 에만, 클라이언트 번들에 절대 포함 금지.

## Phase 1 — MVP
### 1-A 가져오기 스크립트(로컬 Node CLI)
- `npm run import -- <gcg폴더>` · `.gcg` 전부 파싱 → songs upsert(key: source_file) · `--dry-run` 은 JSON 파일만 · 요약 출력(처리 수, 0슬라이드 목록, 실패 목록).
### 1-B 컨트롤러 `/control`
- 곡 라이브러리(제목·가사 검색 → 콘티 추가) · 콘티(추가/삭제/드래그, localStorage 만) · 슬라이드 그리드(콘티 전 곡 썸네일, 곡별 제목 헤더)
- 송출: 카드 클릭 즉시 송출 / PVW·PGM 분리 토글 / 현재·다음 슬라이드 크게
- 단축키: →/Space 다음, ← 이전, B 블랭크 토글, ↑/↓ 이전·다음 곡 첫 슬라이드, 숫자 = 현재 곡 N번째
- 출력 설정: 폰트/크기/색/외곽선·그림자, 위치(하단/중앙), 배경(검정=루마키, 초록=크로마키), 전환(컷/페이드)
- 출력 창: "출력 시작" → Window Management API(`getScreenDetails`)로 두 번째 모니터 전체화면, 불가하면 새 창 + F11 안내
### 1-C 출력 `/output`
- BroadcastChannel 로 받은 상태만 그림 · 커서 숨김 · Wake Lock · 새로고침/재오픈 시 컨트롤러에 상태 요청해 즉시 복구 · 넘치면 글자 자동 축소
### 1-D 상태 모델
```ts
type LiveState = {
  version: number   // 증가. 수신 측은 더 큰 version 만 반영
  setlist: { songId: string; title: string; slides: string[] }[]
  itemIndex: number
  slideIndex: number
  blank: boolean
  style: OutputStyle
}
```
Phase 2 Realtime 추가 시에도 같은 모델 → `SyncTransport` 인터페이스, 구현체 `BroadcastChannelTransport`.
### 완료 기준
- 오프라인에서 콘티 구성~송출 전부 동작 · 슬라이드 변경이 출력에 지연 없이 반영 · 출력 창 닫았다 열어도 즉시 복구 · 2000곡 검색 100ms 이내

## Phase 2 — 폰 연동
- Supabase Realtime 으로 폰 보기/조작. PC 창끼리는 계속 BroadcastChannel, 두 경로 동시 수신, version 으로 중복 제거.
- 출력 창은 Realtime 이 끊겨도 로컬 채널로 계속 동작.
- 역할: 방장(PC), 컨트롤러(방장 승인), 뷰어(URL 접속). 권한은 요청 → 방장 승인. 동시 조작 1명. 방장은 언제든 즉시 회수.
- `rooms` 테이블 행 하나에 현재 콘티·위치를 덮어씀(기록 없음). 늦게 들어온 기기는 이 행을 읽고 따라옴.

## Phase 3 — 성경 구절
- `verses(version, book, chapter, verse, text)` · "요 3:16-18" 입력 → 슬라이드 자동 분할 + 출처 표시.
- 저작권 만료된 개역한글부터. 개역개정은 대한성서공회 허가 전까지 넣지 않음.

---

## 명세 이후 변경·추가된 결정
- `LiveState` 에 `origin`(변경 주체) 추가, setlist 항목에 `key`(같은 곡 중복 구분) 추가. version = `max(prev+1, Date.now())`.
- songs 에 `deleted_at`(소프트 삭제), `source_file unique`, 내용 변경 시에만 updated_at 갱신하는 트리거.
- trim 후 빈 문자열이 되는 묶음은 슬라이드에서 제외(Python 기준 파서는 포함). `.gcg.gbk` 백업 파일은 무시.
- 출력 텍스트: 줄바꿈은 유지하되 자동 줄넘김 없이 축소(최소 40%), 그래도 넘치면 그때만 줄넘김.
- 즉시 모드에서는 NEXT 모니터/다음 슬라이드 표시 없음(헷갈림). PVW 모드에서만 PVW 모니터 + 파란 점선.
- 송출 중 색 = 초록(노랑은 BLANK 전용, 빨강은 오류 전용).
- 폰 뷰어는 로그인 없이 방코드로 접속, 현재 콘티 곡만 노출, 컨트롤러는 Realtime 송신 전용. 조작 기능은 아직.
- 곡 편집기(추가/수정/삭제)를 앱 안에 추가 — 명세엔 없었음. 빈 줄 = 슬라이드 구분.
- 공개 회원가입 차단. 스태프 계정은 대시보드 또는 `npm run staff`.
- Node 22 고정(supabase-js 요구).
