/**
 * 컨트롤러 측 LiveState 소유자.
 * 모든 변경은 commit() 하나를 거친다 → version 증가 → localStorage 저장 → 전송.
 *
 * 채널 하나를 연 동안만 의미가 있다(openHost / openRemote → closeChannel).
 *  - host   : 이 PC 의 컨트롤러. 변경은 commit() — 화면을 먼저 바꾸고, 인터넷 송출이면 publish 로 서버에 올린다.
 *             리모컨이 서버 상태를 바꾸면 adoptState() 로 따라간다(로컬 송출이면 서버 없음).
 *  - remote : 폰 리모컨. 상태는 서버가 준 것을 비추기만 하고(commit 불가),
 *             actions 는 명령(Command)으로 바뀌어 서버(remote_command)로 간다. 곡/선곡/스타일 변경 권한 없음.
 */
import { reactive, ref, computed, readonly } from 'vue'
import { emptyLiveState, nextVersion, type LiveState, type OutputStyle, type SetlistItem } from '@shared/types'
import { BroadcastChannelTransport } from '@/sync/BroadcastChannelTransport'
import { SyncHub } from '@/sync/SyncHub'
import type { Command, SyncMessage } from '@/sync/SyncTransport'
import { loadLive, saveLive, isLiveState, normalizeLive } from './persistence'
import * as nav from './nav'
import { uid } from '@/lib/uid'
import type { Cursor } from './nav'
import { remapIndex, replaceSlides, duplicateAt, duplicateIndex, moveAt, moveIndex } from '@/control/slideEdit'
import { itemFingerprint } from '@shared/history'

export type Role = 'host' | 'remote'

const ORIGIN = `pc-${uid().slice(0, 8)}`
const state = reactive<LiveState>(emptyLiveState(ORIGIN))
const role = ref<Role>('host')
const channelCode = ref<string | null>(null)

/** PVW 모드 여부와 미리보기 커서는 컨트롤러 로컬 상태(송출 상태 아님). 리모컨엔 PVW 가 없다 */
const pvwMode = ref(false)
const preview = ref<Cursor | null>(null)
const outputSeenAt = ref(0)
/** 편집 창 등 모달이 열려 있으면 송출 단축키 중지 */
const hotkeysPaused = ref(false)

const snapshot = (): LiveState => JSON.parse(JSON.stringify(state))

let hub: SyncHub | null = null
let remoteSend: ((c: Command) => void) | null = null
let publishHook: ((s: LiveState) => void) | null = null
let previewHook: ((m: Extract<SyncMessage, { type: 'style-preview' }>) => void) | null = null
/** '바로 적용' 임시 설정을 보내는 중인지(닫을 때 끝 신호를 보내야 하는지) */
let previewActive = false

/** 호스트로 채널 열기. 같은 PC 의 출력 창과는 BroadcastChannel(채널별 이름)로 */
export function openHost(code: string, hooks: { publish: (s: LiveState) => void; publishPreview?: (m: Extract<SyncMessage, { type: 'style-preview' }>) => void }) {
  closeChannel()
  role.value = 'host'
  channelCode.value = code
  Object.assign(state, loadLive(code) ?? emptyLiveState(ORIGIN))
  publishHook = hooks.publish
  previewHook = hooks.publishPreview ?? null
  hub = new SyncHub(
    [new BroadcastChannelTransport(`biew-live:${code}`)],
    // 같은 채널의 다른 호스트 탭이 더 새 상태를 보냈으면 따라간다
    (s) => { Object.assign(state, s); saveLive(code, snapshot()) },
    (m) => {
      if (m.type === 'request-state') hub?.send({ type: 'state', state: snapshot() })
      if (m.type === 'output-alive') outputSeenAt.value = Date.now()
    },
  )
  hub.mark(state)
  // 시작 시 한 번 방송 — 이미 열려 있는 출력 창이 즉시 맞춰지도록
  hub.send({ type: 'state', state: snapshot() })
}

/** 폰 리모컨으로 채널 열기. send 는 control topic 으로 명령을 보내는 함수 */
export function openRemote(code: string, send: (c: Command) => void) {
  closeChannel()
  role.value = 'remote'
  channelCode.value = code
  Object.assign(state, emptyLiveState(ORIGIN))
  remoteSend = send
  hub = new SyncHub([], (s) => { Object.assign(state, s) })
}

export function closeChannel() {
  // 바로 적용 중이었으면 연결을 끊기 전에 '임시 설정 끝'을 보낸다 — 끊은 뒤엔 보낼 길이 없어 송출 화면에 저장 안 한 설정이 시한(6초)까지 남는다
  if (previewActive) sendStylePreview(null)
  previewActive = false
  hub?.close()
  hub = null; remoteSend = null; publishHook = null; previewHook = null
  channelCode.value = null
  preview.value = null
  pvwMode.value = false
  outputSeenAt.value = 0
}

/** 서버(channels.state) 또는 호스트가 보낸 상태가 지금보다 새로우면 따라간다. 호스트면 출력 창에도 알림 */
export function adoptState(s: unknown) {
  if (!isLiveState(s) || !hub) return
  if (hub.receive(normalizeLive(s)) && role.value === 'host') {
    if (channelCode.value) saveLive(channelCode.value, snapshot())
    hub.send({ type: 'state', state: snapshot() })
  }
}

function commit(mutate: (s: LiveState) => void) {
  const code = channelCode.value
  if (role.value !== 'host' || !code || !hub) return // 리모컨·미연결 상태에선 상태를 바꿀 수 없다
  mutate(state)
  state.version = nextVersion(state.version)
  state.origin = ORIGIN
  const snap = snapshot()
  hub.mark(snap)
  saveLive(code, snap)
  hub.send({ type: 'state', state: snap })
  publishHook?.(snap) // 채널 서버(보는 기기·리모컨)로도. 실패해도 로컬 송출엔 영향 없음
}

/**
 * 출력 설정 '바로 적용' 임시 설정 보내기(src/live/styleDraft.ts 가 부른다). 상태는 안 바꾼다.
 * 같은 PC 출력 창 = BroadcastChannel 즉시, 인터넷 송출이면 보기 기기에도(publishPreview — 묶어서 보냄).
 */
export function sendStylePreview(style: OutputStyle | null, until?: number) {
  if (role.value !== 'host' || !hub) return
  // 수정본은 Vue 반응형(Proxy) — BroadcastChannel(postMessage)은 Proxy 를 복사하지 못해 조용히 실패하므로 일반 객체로
  const plain = style ? (JSON.parse(JSON.stringify(style)) as OutputStyle) : null
  const m = { type: 'style-preview' as const, style: plain, ...(until !== undefined ? { until } : {}) }
  previewActive = style !== null
  hub.send(m)
  previewHook?.(m)
}

// ── 송출 ────────────────────────────────────────────
function go(c: Cursor | null) {
  if (!c) return
  commit((s) => { s.itemIndex = c.itemIndex; s.slideIndex = c.slideIndex; s.blank = false })
  preview.value = null // 미리보기는 기본값(다음 장)으로 복귀
}

/** 다음 송출될 위치: PVW 에서 고른 것 or 자동 다음 장 */
const upcoming = computed<Cursor | null>(() => preview.value ?? nav.next(state))

/** 호스트(PC)가 자기 조작을 적용(인터넷 송출의 리모컨 명령은 서버가 적용 — remote_command) */
function applyCommand(c: Command) {
  switch (c.cmd) {
    case 'next': go(nav.next(state)); break
    case 'prev': go(nav.prev(state)); break
    case 'nextSong': go(nav.nextSong(state)); break
    case 'prevSong': go(nav.prevSong(state)); break
    case 'blank': commit((s) => { s.blank = !s.blank }); break
    case 'go': go({ itemIndex: c.itemIndex, slideIndex: c.slideIndex }); break
  }
}

/** 리모컨이면 명령으로 보내고, 호스트면 바로 적용 */
function dispatch(c: Command) {
  if (role.value === 'remote') remoteSend?.(c)
  else applyCommand(c)
}

const actions = {
  go: (c: Cursor | null) => { if (c) dispatch({ cmd: 'go', itemIndex: c.itemIndex, slideIndex: c.slideIndex }) },
  next: () => (role.value === 'host' && pvwMode.value && preview.value ? go(preview.value) : dispatch({ cmd: 'next' })),
  prev: () => dispatch({ cmd: 'prev' }),
  nextSong: () => dispatch({ cmd: 'nextSong' }),
  prevSong: () => dispatch({ cmd: 'prevSong' }),
  nth: (n: number) => actions.go(nav.nth(state, n)),
  take: () => go(upcoming.value),
  toggleBlank: () => dispatch({ cmd: 'blank' }),
  /** FREEZE 걸기: 지금 송출 화면을 고정(컨트롤러 조작은 계속 가능). 이미 걸려 있으면 아무것도 안 함 — 단축키용. 호스트 전용 */
  freeze: () => {
    if (state.frozen) return
    commit((s) => { s.frozen = { itemIndex: s.itemIndex, slideIndex: s.slideIndex, blank: s.blank, text: nav.currentText(s) } })
  },
  /** FREEZE 풀기: 컨트롤러의 현재 위치가 바로 송출된다. 실수 방지로 단축키 없이 버튼으로만 */
  unfreeze: () => { if (state.frozen) commit((s) => { s.frozen = null }) },
  /**
   * 송출 종료(로컬 송출): 선곡·위치·BLANK·FREEZE 를 비운다. 출력 설정(폰트·여백 등)은 유지.
   * 출력 창은 닫지 않고 검은 화면이 된다 — 전체화면 출력 창을 닫으면 프로젝터에 PC 바탕화면이 보이므로.
   * 실수로 닫거나 새로고침한 경우는 이어지고(저장됨), 이 버튼을 눌렀을 때만 끝난다.
   */
  endSession: () => {
    preview.value = null
    commit((s) => { s.setlist = []; s.itemIndex = 0; s.slideIndex = 0; s.blank = false; s.frozen = null })
  },
  /** 카드 클릭: 즉시 모드면 바로 송출, PVW 모드면 미리보기 지정 */
  pick: (c: Cursor) => (pvwMode.value ? (preview.value = c) : actions.go(c)),
}

// ── 선곡 (호스트 전용: commit 이 리모컨에선 동작하지 않는다) ─────────────
function liveKey(): string | undefined {
  return state.setlist[state.itemIndex]?.key
}

/** 선곡 변경 후 송출 중이던 곡을 key 로 다시 찾아 itemIndex 보정 */
function setSetlist(list: SetlistItem[]) {
  const key = liveKey()
  const previewKey = preview.value ? state.setlist[preview.value.itemIndex]?.key : undefined
  commit((s) => {
    s.setlist = list
    const idx = key ? list.findIndex((x) => x.key === key) : -1
    if (idx >= 0) s.itemIndex = idx
    else {
      // 송출 중 곡이 삭제됨 → 자막 내리고 안전한 위치로
      if (key) s.blank = true
      s.itemIndex = Math.min(s.itemIndex, Math.max(list.length - 1, 0))
      // 송출 중이던 곡이 없었으면(빈 선곡에 첫 곡) 송출 대기 — 장을 눌러야 나간다(2026-11-25 사용자 결정, nav.isIdle)
      s.slideIndex = key ? 0 : -1
      if (!key) s.blank = false // 대기 = 빈 화면, BLANK 와 섞이지 않게
    }
  })
  if (preview.value) {
    const pi = previewKey ? list.findIndex((x) => x.key === previewKey) : -1
    preview.value = pi >= 0 ? { itemIndex: pi, slideIndex: preview.value.slideIndex } : null
  }
}

const setlist = {
  add(song: { id: string; title: string; slides: string[] }) {
    // base = 넣을 때 원본 지문 — 오늘 고치면 "변경됨"(곡 제목 줄 [저장]으로 원본에)
    setSetlist([...state.setlist, { key: uid(), songId: song.id, title: song.title, slides: [...song.slides], base: itemFingerprint(song) }])
  },
  /** [저장]으로 지금 슬라이드를 곡 원본에 저장했을 때 — 지금 내용이 새 기준(변경됨 표시 끔) */
  markSaved(key: string) {
    const i = state.setlist.findIndex((x) => x.key === key)
    if (i < 0) return
    commit((s) => { s.setlist[i] = { ...s.setlist[i]!, base: itemFingerprint(s.setlist[i]!) } })
  },
  remove(key: string) {
    setSetlist(state.setlist.filter((x) => x.key !== key))
  },
  replace: setSetlist,
  /** 장 복사(바로 뒤에) — 오늘 선곡만. 송출·FREEZE·미리보기는 같은 장을 계속 가리킨다 */
  duplicateSlide(key: string, j: number) { reshape(key, (sl) => (j >= 0 && j < sl.length ? duplicateAt(sl, j) : null), (x) => duplicateIndex(x, j)) },
  /** 장 순서 바꾸기(끌기) — 오늘 선곡만. 송출·FREEZE·미리보기는 같은 장을 따라간다 */
  moveSlide(key: string, from: number, to: number) {
    reshape(key, (sl) => (from !== to && from >= 0 && to >= 0 && from < sl.length && to < sl.length ? moveAt(sl, from, to) : null), (x) => moveIndex(x, from, to))
  },
  /**
   * 선곡 기록을 복사해 새 선곡으로 시작(src/live/history.ts). 송출 대기(빈 화면 — 장을 눌러야 나감), FREEZE 해제
   * (FREEZE 는 옛 선곡의 위치를 가리키므로).
   */
  startFrom(items: SetlistItem[]) {
    preview.value = null
    commit((s) => { s.setlist = items; s.itemIndex = 0; s.slideIndex = -1; s.blank = false; s.frozen = null })
  },
  /** 선곡 항목을 라이브러리의 최신 가사로 교체. 송출 중이면 슬라이드 번호를 범위 안으로 보정 */
  refresh(key: string, song: { title: string; slides: string[] }) {
    const i = state.setlist.findIndex((x) => x.key === key)
    if (i < 0) return
    commit((s) => {
      const it = s.setlist[i]!
      s.setlist[i] = { ...it, title: song.title, slides: [...song.slides], base: itemFingerprint(song) }
      if (s.itemIndex === i) {
        if (!song.slides.length) { s.blank = true; s.slideIndex = 0 }
        else s.slideIndex = Math.min(s.slideIndex, song.slides.length - 1)
      }
    })
    if (preview.value?.itemIndex === i) preview.value = null
  },
  clear() {
    setSetlist([])
  },
  /**
   * 슬라이드 글만 고치기(카드의 ✎). 장 수·순서·송출 위치는 그대로 → 송출 중인 장이면 저장 즉시 새 글이 나간다.
   * FREEZE 중이면 고정 화면은 텍스트 스냅샷이라 그대로(풀면 반영).
   */
  /**
   * pieces = [] 이면 그 장들 삭제. 결과: 'ok' · 'last'(곡의 장이 하나도 안 남음) · 'frozen'(FREEZE 중인 장 삭제 —
   * 송출은 고정 글 그대로인데 번호만 옆 장으로 옮겨 목록의 '송출 중' 표시가 엉뚱한 장에 붙으므로 막는다) · 'stale'(그 사이 선곡이 바뀜)
   */
  editSlides(key: string, indexes: number[], pieces: string[]): 'ok' | 'last' | 'frozen' | 'stale' {
    const i = state.setlist.findIndex((x) => x.key === key)
    if (i < 0) return 'stale'
    const it0 = state.setlist[i]!
    const targets = [...new Set(indexes)].filter((j) => j >= 0 && j < it0.slides.length).sort((a, b) => a - b)
    if (!targets.length) return 'stale'
    if (pieces.length === 0 && state.frozen?.itemIndex === i && targets.includes(state.frozen.slideIndex)) return 'frozen'
    const next = replaceSlides(it0.slides, targets, pieces)
    if (!next.length) return 'last'
    // 나누기(2026-11-19)·삭제(2026-11-22): 장 수가 바뀌면 송출·FREEZE·미리보기 위치를 '같은 글'로 옮긴다.
    // 송출 중인 장이나 그 뒤를 바꾸면 번호 그대로, 앞을 바꾸면 늘거나 준 만큼(번호를 그대로 두면 화면이 다른 장으로 튐)
    const n = pieces.length
    const remap = (j: number) => remapIndex(j, targets, n, next.length)
    commit((s) => {
      const it = s.setlist[i]!
      // 컨트롤러가 가리키던 장을 지우면 BLANK — FREEZE 중이면 송출은 고정 화면 그대로이고, 풀 때 엉뚱한 장 대신 BLANK
      if (n === 0 && s.itemIndex === i && targets.includes(s.slideIndex)) s.blank = true
      s.setlist[i] = { ...it, slides: next, base: it.base ?? itemFingerprint(it) }
      if (s.itemIndex === i) s.slideIndex = remap(s.slideIndex)
      if (s.frozen && s.frozen.itemIndex === i) s.frozen = { ...s.frozen, slideIndex: remap(s.frozen.slideIndex) }
    })
    if (preview.value?.itemIndex === i) preview.value = { itemIndex: i, slideIndex: remap(preview.value.slideIndex) }
    return 'ok'
  },
}

/** 한 곡의 장 목록을 바꾸고 그 곡을 가리키는 위치(송출·FREEZE·미리보기)를 remap 으로 옮긴다. change 가 null 이면 아무것도 안 함 */
function reshape(key: string, change: (slides: readonly string[]) => string[] | null, remap: (j: number) => number) {
  const i = state.setlist.findIndex((x) => x.key === key)
  if (i < 0) return
  const next = change(state.setlist[i]!.slides)
  if (!next) return
  commit((s) => {
    const it = s.setlist[i]!
    // base 없는 예전 항목: 처음 고치는 지금의 내용을 원본 기준으로(이후 '변경됨' 판단)
    s.setlist[i] = { ...it, slides: next, base: it.base ?? itemFingerprint(it) }
    if (s.itemIndex === i) s.slideIndex = remap(s.slideIndex)
    if (s.frozen && s.frozen.itemIndex === i) s.frozen = { ...s.frozen, slideIndex: remap(s.frozen.slideIndex) }
  })
  if (preview.value?.itemIndex === i) preview.value = { itemIndex: i, slideIndex: remap(preview.value.slideIndex) }
}

function setStyle(patch: Partial<OutputStyle>) {
  commit((s) => { s.style = { ...s.style, ...patch } })
}

export function useLive() {
  return {
    state: readonly(state) as LiveState,
    role: readonly(role),
    channelCode: readonly(channelCode),
    pvwMode,
    preview: readonly(preview),
    upcoming,
    outputSeenAt,
    hotkeysPaused,
    actions,
    setlist,
    setStyle,
  }
}
