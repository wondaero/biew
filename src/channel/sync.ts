/**
 * 인터넷 송출의 실시간 연결. 송출 상태의 원본은 서버(channels.state).
 * 네트워크가 끊겨도 로컬 송출(PC 컨트롤러 ↔ 출력 창, BroadcastChannel)은 멈추지 않는다.
 *
 * 호스트(PC): 이 PC 에 저장된 호스트 토큰(live/persistence.ts 의 host 기록)으로 — 로그인 불필요.
 *   - PC 에서 조작하면 화면을 먼저 바꾸고(liveStore.commit) 서버에 올린다(host_set_state).
 *     못 올리면(인터넷 끊김) '서버에 아직 못 올림'(dirty)을 남기고 PC 혼자 계속. 다시 연결되면 PC 기준으로 덮어쓴다(force).
 *   - 리모컨이 서버 상태를 바꾸면 알림이 오는데, 알림 내용은 믿지 않고 서버에서 다시 읽는다(host_join)
 *     — 실시간 주소는 리모컨도 보낼 수 있어 가짜 상태(선곡 교체 등)를 섞을 수 있기 때문.
 * 리모컨(폰): 명령을 서버로(remote_command — 서버가 검사·적용, PC 가 꺼져 있어도 동작).
 *   결과 상태를 화면에 쓰고, control/view 주소로 알린다(DB 발 공개 알림은 전달되지 않아 변경한 쪽이 알림 — 마이그레이션 20261118010000).
 *   상태는 control 주소에서만 받는다(view 주소는 보는 기기도 보낼 수 있으므로).
 */
import { ref, watch } from 'vue'
import type { LiveState } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { session } from '@/lib/auth'
import { SupabaseRealtimeTransport } from '@/sync/SupabaseRealtimeTransport'
import type { Command, SyncMessage } from '@/sync/SyncTransport'
import { isLiveState, normalizeLive, loadHost, saveHost, patchHost, setHostDirty, isHostDirty } from '@/live/persistence'
import * as api from './api'
import { hostMediaStart, hostMediaStop, hostMediaKick, hostMediaReconnect } from './mediaSync'
import { bumpMedia } from '@/media/media'

export type Link = 'off' | 'connecting' | 'live' | 'error'
export const hostLink = ref<Link>('off')
/** 이 PC 의 호스트 토큰이 없거나 거부됨(30일 미사용·채널 삭제) → 로그인하면 새로 받는다. PC 송출은 계속된다 */
export const hostNeedsLogin = ref(false)
/** 이 채널이 서버에서 삭제됨(다른 기기에서 지움 등) → 재시도하지 않는다. PC 송출(출력 창, BroadcastChannel)은 계속된다 */
export const hostDeleted = ref(false)
export const remoteLink = ref<Link>('off')
/** 리모컨의 토큰이 거부됨(접속 끊기·비밀번호 변경·만료·채널 삭제) → 입력 화면으로 돌아가야 함 */
export const remoteRejected = ref(false)

const BAD = (st: string) => st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED'

// ── 호스트 ──────────────────────────────────────────
let hostCode: string | null = null
let view: SupabaseRealtimeTransport | null = null
let ctl: SupabaseRealtimeTransport | null = null
let getState: (() => LiveState) | null = null
let adopt: ((s: unknown) => void) | null = null
let retryTimer: number | undefined
let checkTimer: number | undefined
let fetchTimer: number | undefined
/** 지금 연결된 실시간 주소(10초마다 확인). 다른 기기에서 '리모컨 쫓아내기'·'보기 비밀번호 변경'을 하면 바뀐다 → 다시 연결 */
let curCtl: string | null = null
let curView: string | null = null
let gen = 0
let pushing = false
let queued: { s: LiveState; force: boolean } | null = null

/** 채널이 서버에서 사라짐: 실시간 연결을 닫고 재시도·주기 확인을 멈춘다(로컬 상태·출력 창은 그대로) */
function markDeleted() {
  gen++
  closeHostTransports()
  hostDeleted.value = true
  hostLink.value = 'error'
}

function closeHostTransports() {
  view?.close(); ctl?.close(); view = null; ctl = null
}

/** 로그인 중이면 이 PC 용 호스트 토큰을 새로 받아 저장 */
async function refreshGrant(code: string): Promise<boolean> {
  if (!session.value) return false
  const g = await api.issueHostToken(code)
  if (!g.grant) return false
  saveHost(code, { title: g.grant.title, token: g.grant.token, controlTopic: g.grant.controlTopic, viewTopic: g.grant.viewTopic })
  return true
}

/** 토큰 거부: 로그인 중이면 바로 새로 받고, 아니면 '로그인 필요' 표시 */
async function onRejected(code: string) {
  patchHost(code, { token: null })
  if (await refreshGrant(code)) { void connectHost(); return }
  hostNeedsLogin.value = true
  hostLink.value = 'error'
}

async function connectHost(retried = false) {
  const code = hostCode
  if (!code || !supabase) return
  const my = ++gen
  closeHostTransports()
  hostLink.value = 'connecting'
  if (!navigator.onLine) { hostLink.value = 'error'; return }
  if (!loadHost(code)?.token) await refreshGrant(code)
  if (my !== gen) return
  const token = loadHost(code)?.token
  if (!token) { hostNeedsLogin.value = true; hostLink.value = 'error'; return }

  const j = await api.hostJoin(code, token)
  if (my !== gen) return
  if (j.status === 'token_rejected') { if (!retried) await onRejected(code); return }
  if (j.status === 'not_found') { markDeleted(); return }
  if (j.status !== 'ok' || !j.controlTopic || !j.viewTopic) { hostLink.value = 'error'; return }
  hostNeedsLogin.value = false
  patchHost(code, { title: j.title ?? loadHost(code)?.title ?? code, controlTopic: j.controlTopic, viewTopic: j.viewTopic })

  curCtl = j.controlTopic; curView = j.viewTopic
  view = new SupabaseRealtimeTransport(supabase, j.viewTopic, { sendOnly: true })
  ctl = new SupabaseRealtimeTransport(supabase, j.controlTopic, {
    onStatus: (st) => {
      if (my !== gen) return
      if (st === 'SUBSCRIBED') hostLink.value = 'live'
      else if (BAD(st)) hostLink.value = 'error'
    },
  })
  // 알림은 '바뀌었다'는 신호로만 — 실제 상태는 서버에서 읽는다
  ctl.subscribe((m) => { if (m.type === 'state') void fetchNow() })
  hostMediaReconnect() // 그림: 서버 목록부터 다시 읽고 빠진 것 올리기(그림이 없으면 아무것도 안 함)

  // 상태 맞추기: 끊긴 동안 PC 혼자 송출했다면 PC 기준(force), 아니면 더 새로운 쪽
  const local = getState?.()
  if (isHostDirty(code) && local) await push(local, true)
  else {
    if (j.state) adopt?.(j.state)
    const now = getState?.()
    if (now && (!j.state || now.version > j.state.version)) await push(now, false)
  }
}

/**
 * 서버의 현재 상태를 읽어 반영(리모컨이 바꿨을 때). 알림을 받으면 기다리지 않고 바로 읽는다(2026-11-22 성능 점검 —
 * 예전엔 0.03초 모아서 읽었다). 알림이 몰리면: 읽는 중엔 새로 읽지 않고, 끝난 뒤 한 번만 더 읽는다(마지막 변경을 놓치지 않게).
 * 타이머를 거치지 않는 이유: 가려진 창은 브라우저가 타이머를 늦춘다.
 * 주소가 바뀌었으면(다른 기기에서 쫓아내기·보기 비밀번호 변경) 다시 연결한다.
 */
/** 읽는 중(시작 시각, 0 = 아님). 응답이 안 오는 요청(인터넷이 순간 끊김)이 다음 읽기를 영영 막지 않게 5초 지나면 무시 */
let fetchingSince = 0
let fetchAgain = false
/** 올리는 중이라 미룬 읽기 — 올리기가 끝나면 바로(타이머 없이) */
let fetchAfterPush = false
const FETCH_STUCK_MS = 5000
function scheduleFetch(delay = 0) {
  clearTimeout(fetchTimer)
  fetchTimer = window.setTimeout(() => void fetchNow(), delay)
}
async function fetchNow() {
  if (fetchingSince && Date.now() - fetchingSince < FETCH_STUCK_MS) {
    fetchAgain = true
    // 읽던 요청이 응답 없이 멈추면 finally 가 안 와서 '한 번 더'가 영영 안 될 수 있다 → 멈춤 시한이 지나면 다시 시도
    scheduleFetch(FETCH_STUCK_MS - (Date.now() - fetchingSince) + 20)
    return
  }
  const code = hostCode
  const token = code ? loadHost(code)?.token : null
  if (!code || !token) return
  if (pushing || queued) { fetchAfterPush = true; return } // 올리는 중이면 끝난 뒤 바로(push 의 finally)
  const started = Date.now()
  fetchingSince = started
  try {
    const j = await api.hostJoin(code, token)
    if (code !== hostCode) return
    if (j.status === 'ok') {
      if ((j.controlTopic && j.controlTopic !== curCtl) || (j.viewTopic && j.viewTopic !== curView)) { void connectHost(); return }
      if (j.state) adopt?.(j.state)
    } else if (j.status === 'token_rejected') void onRejected(code)
    else if (j.status === 'not_found') markDeleted()
  } finally {
    // 늦게 끝난 옛 요청(5초 넘어 무시된 것)이 새 요청의 표시를 지우지 않게
    if (fetchingSince === started) {
      fetchingSince = 0
      // 그 사이 다른 채널로 갔으면(code 가 바뀜) 옛 채널의 '한 번 더'는 버린다
      if (fetchAgain && code === hostCode) { fetchAgain = false; clearTimeout(fetchTimer); void fetchNow() }
    }
  }
}

/** 서버에 올리고, 성공하면 보기 기기·리모컨에 알린다. 동시에 여러 번 오면 마지막 것만 이어서 */
async function push(s: LiveState, force: boolean) {
  const code = hostCode
  if (!code) return
  if (pushing) { queued = { s, force: force || !!queued?.force }; return }
  const token = loadHost(code)?.token
  if (!token) { setHostDirty(code, true); return }
  pushing = true
  try {
    const st = await api.hostSetState(code, token, s, force)
    if (code !== hostCode) return
    if (st === 'ok') {
      setHostDirty(code, false)
      const msg: SyncMessage = { type: 'state', state: s }
      view?.send(msg); ctl?.send(msg)
    } else if (st === 'stale') {
      setHostDirty(code, false) // 그 사이 리모컨이 바꿈 → 서버 것을 따른다
      scheduleFetch(0)
    } else if (st === 'token_rejected') {
      setHostDirty(code, true)
      void onRejected(code)
    } else if (st === 'not_found') {
      markDeleted()
    } else {
      setHostDirty(code, true) // 인터넷 끊김 등 — PC 혼자 계속, 다시 연결되면 PC 기준으로
      hostLink.value = 'error'
    }
  } finally {
    pushing = false
    const q = queued
    queued = null
    if (q) void push(q.s, q.force)
    else if (fetchAfterPush) { fetchAfterPush = false; void fetchNow() }
  }
}

const onOnline = () => { if (hostCode && !hostDeleted.value) void connectHost() }
const onOffline = () => { if (hostCode) hostLink.value = 'error' }
// 로그인하면 이 PC 의 호스트 토큰을 새로 받아 다시 연결
watch(session, (s) => { if (s && hostCode && hostLink.value !== 'live' && !hostDeleted.value) { patchHost(hostCode, { token: hostNeedsLogin.value ? null : loadHost(hostCode)?.token ?? null }); void connectHost() } })

export function startHostSync(code: string, opts: { getState: () => LiveState; adopt: (s: unknown) => void }) {
  stopHostSync()
  hostCode = code
  getState = opts.getState
  adopt = opts.adopt
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  // 그림 올리기 — 다 올리면 리모컨·보기에 알림(그쪽이 받는다)
  hostMediaStart(code, { getState: opts.getState, notify: () => { const m: SyncMessage = { type: 'media-ready' }; view?.send(m); ctl?.send(m) } })
  retryTimer = window.setInterval(() => {
    if (hostCode && hostLink.value === 'error' && !hostNeedsLogin.value && !hostDeleted.value) void connectHost()
  }, 15000)
  // 10초마다 서버 확인: 다른 기기에서 바꾼 주소(리모컨 쫓아내기·보기 비밀번호)와 놓친 리모컨 변경을 따라잡는다.
  // 30초였을 때 타이밍에 따라 따라오기까지 21~42초로 들쭉날쭉했다 → 10초. 가벼운 조회 1회라 부담 없음
  checkTimer = window.setInterval(() => { if (hostCode && hostLink.value === 'live') scheduleFetch(0) }, 10000)
  void connectHost()
}

/** 주소가 바뀐 뒤(이 PC 에서 쫓아내기·보기 비밀번호 변경) 바로 다시 연결 */
export function reconnectHost() { void connectHost() }

/** liveStore 가 PC 조작으로 상태가 바뀔 때마다 호출 */
export function publishHost(s: LiveState) {
  const code = hostCode
  if (!code || hostDeleted.value) return
  hostMediaKick() // 선곡에 그림을 넣거나 뺐으면 서버에도
  setHostDirty(code, true) // 서버 확인 전까지는 '못 올림'(중간에 새로고침돼도 다시 연결 시 PC 기준)
  void push(s, false)
}

/**
 * 출력 설정 '바로 적용' 임시 설정을 보기 기기에(인터넷, 서버 DB 를 거치지 않는 실시간 알림만).
 * 슬라이더를 끄는 동안 수십 번 오므로 0.3초에 한 번으로 묶는다(마지막 것은 반드시 보냄). 리모컨 주소엔 안 보냄(리모컨 화면은 설정을 안 그림).
 */
const PREVIEW_GAP_MS = 300
let previewLast = 0
let previewTimer: number | undefined
let previewPending: SyncMessage | null = null
export function publishStylePreview(m: Extract<SyncMessage, { type: 'style-preview' }>) {
  if (!hostCode) return
  previewPending = m
  const wait = PREVIEW_GAP_MS - (Date.now() - previewLast)
  if (wait <= 0) flushPreview()
  else if (previewTimer === undefined) previewTimer = window.setTimeout(flushPreview, wait)
}
function flushPreview() {
  clearTimeout(previewTimer); previewTimer = undefined
  const m = previewPending
  previewPending = null
  if (!m) return
  previewLast = Date.now()
  view?.send(m)
}

export function stopHostSync() {
  gen++
  clearInterval(retryTimer); clearInterval(checkTimer); clearTimeout(fetchTimer)
  if (previewPending) flushPreview() // 묶여 기다리던 마지막 것(보통 '끝' 신호)은 보내고 닫는다
  fetchingSince = 0; fetchAgain = false; fetchAfterPush = false // 옛 채널의 읽기가 새 채널을 막지 않게
  clearTimeout(previewTimer); previewTimer = undefined; previewPending = null
  curCtl = null; curView = null
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  hostMediaStop()
  closeHostTransports()
  hostCode = null; getState = null; adopt = null; queued = null; pushing = false
  hostLink.value = 'off'
  hostNeedsLogin.value = false
  hostDeleted.value = false
}

// ── 리모컨 ──────────────────────────────────────────
let remoteCode: string | null = null
let rCtl: SupabaseRealtimeTransport | null = null
let rView: SupabaseRealtimeTransport | null = null
let rOnState: ((s: LiveState) => void) | null = null
let catchTimer: number | undefined

function rejectRemote() {
  remoteRejected.value = true
  stopRemote(true)
}

/** 토큰 확인 + 서버 상태로 따라잡기(끊긴 동안 놓친 변경 보정) */
async function catchUp() {
  const code = remoteCode
  if (!code) return
  const j = await api.joinControl(code)
  if (code !== remoteCode) return
  if (j.status === 'token_rejected' || j.status === 'password_required' || j.status === 'not_found') return rejectRemote()
  if (j.status === 'ok' && j.state) rOnState?.(j.state)
}
const onVisible = () => { if (document.visibilityState === 'visible') void catchUp() }

export function startRemote(code: string, join: api.Join, onState: (s: LiveState) => void) {
  stopRemote()
  remoteRejected.value = false
  if (!supabase || !join.controlTopic) { remoteLink.value = 'error'; return }
  remoteCode = code
  rOnState = onState
  if (join.state) onState(join.state)
  remoteLink.value = 'connecting'
  rCtl = new SupabaseRealtimeTransport(supabase, join.controlTopic, {
    onStatus: (st) => {
      if (st === 'SUBSCRIBED') { remoteLink.value = 'live'; void catchUp() }
      else if (BAD(st)) remoteLink.value = 'error'
    },
  })
  rCtl.subscribe((m) => {
    if (m.type === 'state' && isLiveState(m.state)) onState(normalizeLive(m.state))
    else if (m.type === 'media-ready') bumpMedia() // 호스트가 그림을 올림 → 없던 그림 다시 받기
  })
  if (join.viewTopic) rView = new SupabaseRealtimeTransport(supabase, join.viewTopic, { sendOnly: true })
  catchTimer = window.setInterval(() => void catchUp(), 30000)
  document.addEventListener('visibilitychange', onVisible)
}

/** 명령을 서버로 → 서버가 적용한 상태를 화면에 쓰고 PC·보기 기기에 알림 */
export async function sendRemote(cmd: Command) {
  const code = remoteCode
  if (!code) return
  const r = await api.remoteCommand(code, cmd)
  if (code !== remoteCode) return
  if (r.status === 'ok' && r.state) {
    rOnState?.(r.state)
    const msg: SyncMessage = { type: 'state', state: r.state }
    rCtl?.send(msg); rView?.send(msg)
  } else if (r.status === 'token_rejected' || r.status === 'not_found') rejectRemote()
  else if (r.status === 'error') remoteLink.value = 'error'
}

/** keepRejected: 거부로 멈춘 경우 rejected 표시를 유지 */
export function stopRemote(keepRejected = false) {
  clearInterval(catchTimer)
  document.removeEventListener('visibilitychange', onVisible)
  rCtl?.close(); rView?.close(); rCtl = null; rView = null
  remoteCode = null; rOnState = null
  remoteLink.value = 'off'
  if (!keepRejected) remoteRejected.value = false
}
