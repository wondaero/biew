/**
 * 채널 실시간 연결. 둘 다 네트워크 실패가 로컬 송출(BroadcastChannel)에 영향을 주지 않는다.
 *
 * 호스트(PC, 소유 계정):
 *   - control topic 수신 → 폰 리모컨 명령을 liveStore 로 넘김(검사·적용은 liveStore.handleCommand)
 *   - view topic 송신 → 보는 기기·리모컨 모니터용 상태. 늦게 들어온 기기를 위해 channels.state 도 덮어씀(0.4초 디바운스)
 * 리모컨(폰, 비밀번호 입장):
 *   - view topic 수신(상태), control topic 송신(명령). 주기적으로 join RPC 로 따라잡고, 거부되면 비밀번호를 다시 묻는다.
 */
import { ref } from 'vue'
import type { LiveState } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { SupabaseRealtimeTransport } from '@/sync/SupabaseRealtimeTransport'
import type { Command } from '@/sync/SyncTransport'
import { isLiveState, normalizeLive } from '@/live/persistence'
import * as api from './api'

export type Link = 'off' | 'connecting' | 'live' | 'error'
export const hostLink = ref<Link>('off')
export const remoteLink = ref<Link>('off')
/** 리모컨의 토큰이 거부됨(접속 끊기·비밀번호 변경·만료·채널 삭제) → 입력 화면으로 돌아가야 함 */
export const remoteRejected = ref(false)

const BAD = (st: string) => st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED'

// ── 호스트 ──────────────────────────────────────────
let hostCode: string | null = null
let view: SupabaseRealtimeTransport | null = null
let ctl: SupabaseRealtimeTransport | null = null
let onCommand: ((raw: unknown) => void) | null = null
let getState: (() => LiveState) | null = null
let saveTimer: number | undefined
let retryTimer: number | undefined
let gen = 0

function closeHostTransports() {
  view?.close(); ctl?.close(); view = null; ctl = null
}

async function connectHost() {
  const code = hostCode
  if (!code || !supabase) return
  const my = ++gen
  closeHostTransports()
  hostLink.value = 'connecting'
  if (!navigator.onLine) { hostLink.value = 'error'; return }
  const t = await api.channelTopics(code)
  if (my !== gen) return // 그 사이 재연결/중지됨
  if (!t) { hostLink.value = 'error'; return }
  view = new SupabaseRealtimeTransport(supabase, t.viewTopic, { sendOnly: true })
  ctl = new SupabaseRealtimeTransport(supabase, t.controlTopic, {
    onStatus: (st) => {
      if (my !== gen) return
      if (st === 'SUBSCRIBED') hostLink.value = 'live'
      else if (BAD(st)) hostLink.value = 'error'
    },
  })
  ctl.subscribe((m) => { if (m.type === 'command') onCommand?.(m.cmd) })
  if (getState) void api.saveChannelState(code, getState()) // 새로 연결되면 현재 상태를 서버에도
}

const onOnline = () => { if (hostCode) void connectHost() }

export function startHostSync(code: string, opts: { onCommand: (raw: unknown) => void; getState: () => LiveState }) {
  stopHostSync()
  hostCode = code
  onCommand = opts.onCommand
  getState = opts.getState
  window.addEventListener('online', onOnline)
  retryTimer = window.setInterval(() => { if (hostCode && hostLink.value !== 'live' && hostLink.value !== 'connecting') void connectHost() }, 20000)
  void connectHost()
}

/** 접속 끊기/비밀번호 변경으로 topic 이 바뀐 뒤 호출 */
export function reconnectHost() { void connectHost() }

/** liveStore 가 상태가 바뀔 때마다 호출 */
export function publishHost(s: LiveState) {
  view?.send({ type: 'state', state: s })
  const code = hostCode
  if (!code) return
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void api.saveChannelState(code, s), 400)
}

export function stopHostSync() {
  gen++
  clearTimeout(saveTimer); clearInterval(retryTimer)
  window.removeEventListener('online', onOnline)
  closeHostTransports()
  hostCode = null; onCommand = null; getState = null
  hostLink.value = 'off'
}

// ── 리모컨 ──────────────────────────────────────────
let remoteCode: string | null = null
let rView: SupabaseRealtimeTransport | null = null
let rCtl: SupabaseRealtimeTransport | null = null
let rOnState: ((s: LiveState) => void) | null = null
let catchTimer: number | undefined

async function catchUp() {
  const code = remoteCode
  if (!code) return
  const j = await api.joinControl(code)
  if (code !== remoteCode) return
  if (j.status === 'token_rejected' || j.status === 'password_required' || j.status === 'not_found') {
    remoteRejected.value = true
    stopRemote(true)
    return
  }
  if (j.status === 'ok' && j.state) rOnState?.(j.state)
}
const onVisible = () => { if (document.visibilityState === 'visible') void catchUp() }

export function startRemote(code: string, join: api.Join, onState: (s: LiveState) => void) {
  stopRemote()
  remoteRejected.value = false
  if (!supabase || !join.viewTopic || !join.controlTopic) { remoteLink.value = 'error'; return }
  remoteCode = code
  rOnState = onState
  remoteLink.value = 'connecting'
  rView = new SupabaseRealtimeTransport(supabase, join.viewTopic, {
    onStatus: (st) => {
      if (st === 'SUBSCRIBED') { remoteLink.value = 'live'; void catchUp() }
      else if (BAD(st)) remoteLink.value = 'error'
    },
  })
  rView.subscribe((m) => {
    if (m.type === 'state' && isLiveState(m.state)) onState(normalizeLive(m.state))
  })
  rCtl = new SupabaseRealtimeTransport(supabase, join.controlTopic, { sendOnly: true })
  catchTimer = window.setInterval(() => void catchUp(), 30000)
  document.addEventListener('visibilitychange', onVisible)
  if (join.state) onState(join.state)
}

export function sendRemote(cmd: Command) {
  rCtl?.send({ type: 'command', cmd })
}

/** keepRejected: 거부로 멈춘 경우 rejected 표시를 유지 */
export function stopRemote(keepRejected = false) {
  clearInterval(catchTimer)
  document.removeEventListener('visibilitychange', onVisible)
  rView?.close(); rCtl?.close(); rView = null; rCtl = null
  remoteCode = null; rOnState = null
  remoteLink.value = 'off'
  if (!keepRejected) remoteRejected.value = false
}
