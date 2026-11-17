/**
 * 컨트롤러 측 LiveState 소유자.
 * 모든 변경은 commit() 하나를 거친다 → version 증가 → localStorage 저장 → 전송.
 *
 * 채널 하나를 연 동안만 의미가 있다(openHost / openRemote → closeChannel).
 *  - host   : 이 PC 의 컨트롤러. 변경은 commit() — 화면을 먼저 바꾸고, 인터넷 송출이면 publish 로 서버에 올린다.
 *             리모컨이 서버 상태를 바꾸면 adoptState() 로 따라간다(로컬 송출이면 서버 없음).
 *  - remote : 폰 리모컨. 상태는 서버가 준 것을 비추기만 하고(commit 불가),
 *             actions 는 명령(Command)으로 바뀌어 서버(remote_command)로 간다. 곡/콘티/스타일 변경 권한 없음.
 */
import { reactive, ref, computed, readonly } from 'vue'
import { emptyLiveState, nextVersion, type LiveState, type OutputStyle, type SetlistItem } from '@shared/types'
import { BroadcastChannelTransport } from '@/sync/BroadcastChannelTransport'
import { SyncHub } from '@/sync/SyncHub'
import type { Command } from '@/sync/SyncTransport'
import { loadLive, saveLive, isLiveState, normalizeLive } from './persistence'
import * as nav from './nav'
import { uid } from '@/lib/uid'
import type { Cursor } from './nav'

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

/** 호스트로 채널 열기. 같은 PC 의 출력 창과는 BroadcastChannel(채널별 이름)로 */
export function openHost(code: string, hooks: { publish: (s: LiveState) => void }) {
  closeChannel()
  role.value = 'host'
  channelCode.value = code
  Object.assign(state, loadLive(code) ?? emptyLiveState(ORIGIN))
  publishHook = hooks.publish
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
  hub?.close()
  hub = null; remoteSend = null; publishHook = null
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
   * 송출 종료(로컬 송출): 콘티·위치·BLANK·FREEZE 를 비운다. 출력 설정(폰트·여백 등)은 유지.
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

// ── 콘티 (호스트 전용: commit 이 리모컨에선 동작하지 않는다) ─────────────
function liveKey(): string | undefined {
  return state.setlist[state.itemIndex]?.key
}

/** 콘티 변경 후 송출 중이던 곡을 key 로 다시 찾아 itemIndex 보정 */
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
      s.slideIndex = 0
    }
  })
  if (preview.value) {
    const pi = previewKey ? list.findIndex((x) => x.key === previewKey) : -1
    preview.value = pi >= 0 ? { itemIndex: pi, slideIndex: preview.value.slideIndex } : null
  }
}

const setlist = {
  add(song: { id: string; title: string; slides: string[] }) {
    setSetlist([...state.setlist, { key: uid(), songId: song.id, title: song.title, slides: [...song.slides] }])
  },
  remove(key: string) {
    setSetlist(state.setlist.filter((x) => x.key !== key))
  },
  replace: setSetlist,
  /** 콘티 항목을 라이브러리의 최신 가사로 교체. 송출 중이면 슬라이드 번호를 범위 안으로 보정 */
  refresh(key: string, song: { title: string; slides: string[] }) {
    const i = state.setlist.findIndex((x) => x.key === key)
    if (i < 0) return
    commit((s) => {
      const it = s.setlist[i]!
      s.setlist[i] = { ...it, title: song.title, slides: [...song.slides] }
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
