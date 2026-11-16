/**
 * 컨트롤러 측 LiveState 소유자.
 * 모든 변경은 commit() 하나를 거친다 → version 증가 → localStorage 저장 → 전송.
 */
import { reactive, ref, computed, readonly } from 'vue'
import { emptyLiveState, nextVersion, type LiveState, type OutputStyle, type SetlistItem } from '@shared/types'
import { BroadcastChannelTransport } from '@/sync/BroadcastChannelTransport'
import { SyncHub } from '@/sync/SyncHub'
import { loadLive, saveLive } from './persistence'
import * as nav from './nav'
import type { Cursor } from './nav'

const ORIGIN = `pc-${crypto.randomUUID().slice(0, 8)}`
const state = reactive<LiveState>(loadLive() ?? emptyLiveState(ORIGIN))

/** PVW 모드 여부와 미리보기 커서는 컨트롤러 로컬 상태(송출 상태 아님) */
const pvwMode = ref(false)
const preview = ref<Cursor | null>(null)
const outputSeenAt = ref(0)

const snapshot = (): LiveState => JSON.parse(JSON.stringify(state))

const hub = new SyncHub(
  [new BroadcastChannelTransport()],
  // 다른 컨트롤러 탭(또는 Phase 2 폰)이 더 새 상태를 보냈으면 따라간다
  (s) => { Object.assign(state, s); saveLive(snapshot()) },
  (m) => {
    if (m.type === 'request-state') hub.send({ type: 'state', state: snapshot() })
    if (m.type === 'output-alive') outputSeenAt.value = Date.now()
  },
)
hub.mark(state)

function commit(mutate: (s: LiveState) => void) {
  mutate(state)
  state.version = nextVersion(state.version)
  state.origin = ORIGIN
  const snap = snapshot()
  hub.mark(snap)
  saveLive(snap)
  hub.send({ type: 'state', state: snap })
}

// 시작 시 한 번 방송 — 이미 열려 있는 출력 창이 즉시 맞춰지도록
hub.send({ type: 'state', state: snapshot() })

// ── 송출 ────────────────────────────────────────────
function go(c: Cursor | null) {
  if (!c) return
  commit((s) => { s.itemIndex = c.itemIndex; s.slideIndex = c.slideIndex; s.blank = false })
  preview.value = null // 미리보기는 기본값(다음 장)으로 복귀
}

/** 다음 송출될 위치: PVW 에서 고른 것 or 자동 다음 장 */
const upcoming = computed<Cursor | null>(() => preview.value ?? nav.next(state))

const actions = {
  go,
  next: () => (pvwMode.value && preview.value ? go(preview.value) : go(nav.next(state))),
  prev: () => go(nav.prev(state)),
  nextSong: () => go(nav.nextSong(state)),
  prevSong: () => go(nav.prevSong(state)),
  nth: (n: number) => go(nav.nth(state, n)),
  take: () => go(upcoming.value),
  toggleBlank: () => commit((s) => { s.blank = !s.blank }),
  setPreview: (c: Cursor | null) => { preview.value = c },
  /** 카드 클릭: 즉시 모드면 바로 송출, PVW 모드면 미리보기 지정 */
  pick: (c: Cursor) => (pvwMode.value ? (preview.value = c) : go(c)),
}

// ── 콘티 ────────────────────────────────────────────
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
    setSetlist([...state.setlist, { key: crypto.randomUUID(), songId: song.id, title: song.title, slides: [...song.slides] }])
  },
  remove(key: string) {
    setSetlist(state.setlist.filter((x) => x.key !== key))
  },
  replace: setSetlist,
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
    pvwMode,
    preview: readonly(preview),
    upcoming,
    outputSeenAt,
    actions,
    setlist,
    setStyle,
  }
}
