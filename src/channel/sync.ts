/**
 * 채널 실시간 연결. 네트워크 실패가 로컬 송출(BroadcastChannel)에 영향을 주지 않는다.
 * 송출 상태는 서버(DB)에 저장하지 않는다 — 호스트 PC 가 원본이고, 늦게 들어온 기기는 같은 topic 에서
 * 'request-state' 를 보내면 호스트가 현재 상태로 답한다(같은 PC 의 출력 창과 같은 방식).
 *
 * 호스트(PC): 이 PC 에 기억해 둔 topic(live/persistence.ts 의 host 기록)으로 연결 → 로그인 불필요.
 *   로그인 중이면 서버에서 최신 topic 을 받아 기억을 갱신한다(다른 곳에서 '접속 끊기'를 했을 수 있으므로).
 *   - control topic: 리모컨 명령 수신(검사·적용은 liveStore.handleCommand) + 상태 송신 + 상태 요청 응답
 *   - view topic   : 상태 송신 + 상태 요청 응답
 * 리모컨(폰, 비밀번호 입장): control topic 하나로 명령 송신 + 상태 수신.
 *   view topic 은 쓰지 않는다 — 보는 기기(비밀번호 없는 채널이면 번호만 아는 누구나)가 위조할 수 있으므로.
 *   주기적으로 join RPC 로 토큰을 확인하고, 거부되면 비밀번호를 다시 묻는다.
 */
import { ref, watch } from 'vue'
import type { LiveState } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { session } from '@/lib/auth'
import { SupabaseRealtimeTransport } from '@/sync/SupabaseRealtimeTransport'
import type { Command } from '@/sync/SyncTransport'
import { isLiveState, normalizeLive, loadHost, saveHost } from '@/live/persistence'
import * as api from './api'

export type Link = 'off' | 'connecting' | 'live' | 'error'
export const hostLink = ref<Link>('off')
/** 호스트 PC 에 기억된 주소가 없음 → 폰/보기 연결은 로그인해야 생긴다(송출은 정상) */
export const hostNeedsLogin = ref(false)
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
let retryTimer: number | undefined
let replyTimer: number | undefined
let lastReply = 0
let gen = 0

function closeHostTransports() {
  view?.close(); ctl?.close(); view = null; ctl = null
}

/** 상태 요청에 답한다. 여러 기기가 한꺼번에 요청해도 0.3초에 한 번만 보낸다 */
function replyState() {
  if (replyTimer !== undefined) return
  const wait = Math.max(0, 300 - (Date.now() - lastReply))
  replyTimer = window.setTimeout(() => {
    replyTimer = undefined
    lastReply = Date.now()
    if (getState) publishHost(getState())
  }, wait)
}

async function connectHost() {
  const code = hostCode
  if (!code || !supabase) return
  const my = ++gen
  closeHostTransports()
  hostLink.value = 'connecting'
  if (!navigator.onLine) { hostLink.value = 'error'; return }
  // 로그인 중이면 최신 topic 으로 기억 갱신(로그인 안 했으면 기억해 둔 것 그대로)
  if (session.value) {
    const t = await api.channelTopics(code)
    if (my !== gen) return
    if (t) saveHost(code, { title: loadHost(code)?.title ?? code, ...t })
  }
  const h = loadHost(code)
  if (!h?.controlTopic || !h.viewTopic) { hostNeedsLogin.value = true; hostLink.value = 'error'; return }
  hostNeedsLogin.value = false
  view = new SupabaseRealtimeTransport(supabase, h.viewTopic)
  ctl = new SupabaseRealtimeTransport(supabase, h.controlTopic, {
    onStatus: (st) => {
      if (my !== gen) return
      if (st === 'SUBSCRIBED') { hostLink.value = 'live'; replyState() } // 연결되면 한 번 알림(재연결 시 리모컨이 따라오도록)
      else if (BAD(st)) hostLink.value = 'error'
    },
  })
  ctl.subscribe((m) => {
    if (m.type === 'command') onCommand?.(m.cmd)
    else if (m.type === 'request-state') replyState()
  })
  view.subscribe((m) => { if (m.type === 'request-state') replyState() })
}

const onOnline = () => { if (hostCode) void connectHost() }
// 로그인하면 최신 topic 을 받아 다시 연결(기억이 없던 PC 도 이때 생긴다)
watch(session, (s) => { if (s && hostCode) void connectHost() })

export function startHostSync(code: string, opts: { onCommand: (raw: unknown) => void; getState: () => LiveState }) {
  stopHostSync()
  hostCode = code
  onCommand = opts.onCommand
  getState = opts.getState
  window.addEventListener('online', onOnline)
  retryTimer = window.setInterval(() => {
    if (hostCode && hostLink.value === 'error' && !hostNeedsLogin.value) void connectHost()
  }, 20000)
  void connectHost()
}

/** 접속 끊기/비밀번호 변경으로 topic 이 바뀐 뒤 호출(새 topic 은 호출 전에 saveHost 로 기억) */
export function reconnectHost() { void connectHost() }

/** liveStore 가 상태가 바뀔 때마다 호출 */
export function publishHost(s: LiveState) {
  view?.send({ type: 'state', state: s })
  ctl?.send({ type: 'state', state: s }) // 리모컨 모니터용(리모컨은 control topic 에서만 상태를 믿는다)
}

export function stopHostSync() {
  gen++
  clearInterval(retryTimer); clearTimeout(replyTimer); replyTimer = undefined
  window.removeEventListener('online', onOnline)
  closeHostTransports()
  hostCode = null; onCommand = null; getState = null
  hostLink.value = 'off'
  hostNeedsLogin.value = false
}

// ── 리모컨 ──────────────────────────────────────────
let remoteCode: string | null = null
let rCtl: SupabaseRealtimeTransport | null = null
let catchTimer: number | undefined

const askState = () => rCtl?.send({ type: 'request-state', from: 'remote' })

/** 토큰이 아직 유효한지 확인하고, 놓친 변경이 있을 수 있으니 상태를 다시 요청 */
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
  askState()
}
const onVisible = () => { if (document.visibilityState === 'visible') void catchUp() }

export function startRemote(code: string, join: api.Join, onState: (s: LiveState) => void) {
  stopRemote()
  remoteRejected.value = false
  if (!supabase || !join.controlTopic) { remoteLink.value = 'error'; return }
  remoteCode = code
  remoteLink.value = 'connecting'
  rCtl = new SupabaseRealtimeTransport(supabase, join.controlTopic, {
    onStatus: (st) => {
      if (st === 'SUBSCRIBED') { remoteLink.value = 'live'; askState() }
      else if (BAD(st)) remoteLink.value = 'error'
    },
  })
  rCtl.subscribe((m) => {
    if (m.type === 'state' && isLiveState(m.state)) onState(normalizeLive(m.state))
  })
  catchTimer = window.setInterval(() => void catchUp(), 30000)
  document.addEventListener('visibilitychange', onVisible)
}

export function sendRemote(cmd: Command) {
  rCtl?.send({ type: 'command', cmd })
}

/** keepRejected: 거부로 멈춘 경우 rejected 표시를 유지 */
export function stopRemote(keepRejected = false) {
  clearInterval(catchTimer)
  document.removeEventListener('visibilitychange', onVisible)
  rCtl?.close(); rCtl = null
  remoteCode = null
  remoteLink.value = 'off'
  if (!keepRejected) remoteRejected.value = false
}
