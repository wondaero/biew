/**
 * 인터넷 송출(채널) 서버 API — supabase/migrations/2026111*_channel*.sql 의 테이블·RPC 래퍼.
 * - 만들기/목록/삭제/접속 끊기/호스트 토큰 발급: 로그인한 소유 계정(로그인은 저장되지 않으므로 그때마다 로그인)
 * - 호스트(PC): 호스트 토큰으로 상태 읽기/올리기(host_join / host_set_state) — 로그인 불필요
 * - 리모컨/보기: join_control / join_view 로 입장(비밀번호 → 기기 토큰 저장), 리모컨 명령은 서버가 적용(remote_command)
 * 송출 상태의 원본은 서버(channels.state). 로컬 송출(/local)은 이 모듈과 무관하다.
 */
import { supabase } from '@/lib/supabase'
import type { LiveState } from '@shared/types'
import type { Command } from '@/sync/SyncTransport'
import { isLiveState, normalizeLive } from '@/live/persistence'

export interface ChannelRow { code: string; title: string; has_view_password: boolean; created_at: string }
export type Kind = 'control' | 'view'
export type JoinStatus = 'ok' | 'not_found' | 'password_required' | 'token_rejected' | 'bad_password' | 'locked' | 'error'

export interface Join {
  status: JoinStatus
  title: string | null
  controlTopic: string | null
  viewTopic: string | null
  state: LiveState | null
  error?: string
}

const asState = (v: unknown): LiveState | null => (isLiveState(v) ? normalizeLive(v) : null)

const tokKey = (k: Kind, code: string) => `biew.tok.${k}.${code}`
export function getToken(k: Kind, code: string): string | null {
  try { return localStorage.getItem(tokKey(k, code)) } catch { return null }
}
function setToken(k: Kind, code: string, t: string) {
  try { localStorage.setItem(tokKey(k, code), t) } catch { /* ignore */ }
}
/** "이 기기 잊기" — 다음 접속에 비밀번호를 다시 묻는다 */
export function forgetToken(k: Kind, code: string) {
  try { localStorage.removeItem(tokKey(k, code)) } catch { /* ignore */ }
}

// ── 비밀번호 실패 잠금: 이 기기(브라우저)만 ────────────────────────────
// 사용자 결정(B): 서버는 잠그지 않는다 → 다른 폰이 덩달아 잠기지 않음. 대신 스크립트 대입은 막지 못한다(인지된 위험).
const LOCK_FAILS = 5
const LOCK_MS = 60_000
const lockKey = (k: Kind, code: string) => `biew.lock.${k}.${code}`
interface Lock { fails: number; until: number }
function readLock(k: Kind, code: string): Lock {
  try { return { fails: 0, until: 0, ...JSON.parse(localStorage.getItem(lockKey(k, code)) ?? '{}') } } catch { return { fails: 0, until: 0 } }
}
function writeLock(k: Kind, code: string, l: Lock | null) {
  try { l ? localStorage.setItem(lockKey(k, code), JSON.stringify(l)) : localStorage.removeItem(lockKey(k, code)) } catch { /* ignore */ }
}
/** 잠겨 있으면 남은 초, 아니면 0 */
export function lockedSeconds(k: Kind, code: string): number {
  return Math.max(0, Math.ceil((readLock(k, code).until - Date.now()) / 1000))
}

const NO_SUPABASE = 'Supabase 설정(.env)이 없습니다'

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
export const isCode = (s: string) => /^[A-Z2-9]{6}$/.test(s)

// ── 소유 계정 ─────────────────────────────────────────
export async function createChannel(title: string, controlPassword: string, viewPassword: string): Promise<{ code?: string; error?: string }> {
  if (!supabase) return { error: NO_SUPABASE }
  const { data, error } = await supabase.rpc('create_channel', {
    p_title: title,
    p_control_password: controlPassword,
    p_view_password: viewPassword || null,
  })
  if (error) return { error: friendly(error.message) }
  return { code: data as string }
}

export async function listChannels(): Promise<{ rows: ChannelRow[]; error?: string }> {
  if (!supabase) return { rows: [], error: NO_SUPABASE }
  const { data, error } = await supabase
    .from('channels').select('code,title,has_view_password,created_at').order('created_at', { ascending: false })
  return error ? { rows: [], error: error.message } : { rows: (data ?? []) as ChannelRow[] }
}

/** 내가 만든 채널이면 행을, 아니면(없거나 남의 것) null. 네트워크 오류는 error */
export async function getChannel(code: string): Promise<{ row: ChannelRow | null; error?: string }> {
  if (!supabase) return { row: null, error: NO_SUPABASE }
  const { data, error } = await supabase
    .from('channels').select('code,title,has_view_password,created_at').eq('code', code).maybeSingle()
  if (error) return { row: null, error: error.message }
  return { row: (data as ChannelRow | null) ?? null }
}

export async function deleteChannel(code: string): Promise<string | null> {
  if (!supabase) return NO_SUPABASE
  const { error } = await supabase.from('channels').delete().eq('code', code)
  return error ? error.message : null
}

export interface HostGrant { token: string; title: string; controlTopic: string; viewTopic: string; state: LiveState | null }

/** 소유 계정(로그인)으로 이 PC 용 호스트 토큰 발급 + 서버 현재 상태 */
export async function issueHostToken(code: string): Promise<{ grant?: HostGrant; error?: string }> {
  if (!supabase) return { error: NO_SUPABASE }
  const { data, error } = await supabase.rpc('issue_host_token', { p_code: code })
  const r = (data as { token: string; title: string; control_topic: string; view_topic: string; state: unknown }[] | null)?.[0]
  if (error || !r) return { error: friendly(error?.message ?? '응답이 없습니다') }
  return { grant: { token: r.token, title: r.title, controlTopic: r.control_topic, viewTopic: r.view_topic, state: asState(r.state) } }
}

/** 모든 기기 접속 끊기 + (선택) 비밀번호 변경. 호스트 토큰도 모두 무효 → 호출한 PC 는 이어서 issueHostToken */
export async function resetAccess(
  code: string,
  o: { controlPassword?: string; viewPassword?: string; removeViewPassword?: boolean } = {},
): Promise<string | null> {
  if (!supabase) return NO_SUPABASE
  const { error } = await supabase.rpc('reset_channel_access', {
    p_code: code,
    p_control_password: o.controlPassword || null,
    p_view_password: o.viewPassword || null,
    p_remove_view_password: !!o.removeViewPassword,
  })
  return error ? friendly(error.message) : null
}

// ── 호스트(PC): 호스트 토큰으로, 로그인 불필요 ─────────────────────────
export type HostStatus = 'ok' | 'not_found' | 'token_rejected' | 'stale' | 'invalid' | 'error'

export async function hostJoin(code: string, token: string): Promise<{ status: HostStatus; title?: string; controlTopic?: string; viewTopic?: string; state?: LiveState | null }> {
  if (!supabase) return { status: 'error' }
  const { data, error } = await supabase.rpc('host_join', { p_code: code, p_token: token })
  const r = (data as { status: HostStatus; title: string; control_topic: string; view_topic: string; state: unknown }[] | null)?.[0]
  if (error || !r) return { status: 'error' }
  return { status: r.status, title: r.title, controlTopic: r.control_topic, viewTopic: r.view_topic, state: asState(r.state) }
}

/** 상태 올리기. 'stale' = 그 사이 서버가 더 새로움(리모컨이 바꿈). force = 다시 연결된 PC 기준으로 덮어씀 */
export async function hostSetState(code: string, token: string, s: LiveState, force = false): Promise<HostStatus> {
  if (!supabase) return 'error'
  const { data, error } = await supabase.rpc('host_set_state', { p_code: code, p_token: token, p_state: s, p_force: force })
  const r = (data as { status: HostStatus }[] | null)?.[0]
  return error || !r ? 'error' : r.status
}

// ── 리모컨 명령(서버가 검사·적용) ───────────────────────────────────
export type RemoteStatus = 'ok' | 'noop' | 'not_found' | 'token_rejected' | 'error'
export async function remoteCommand(code: string, cmd: Command): Promise<{ status: RemoteStatus; state: LiveState | null }> {
  if (!supabase) return { status: 'error', state: null }
  const { data, error } = await supabase.rpc('remote_command', { p_code: code, p_token: getToken('control', code), p_cmd: cmd })
  const r = (data as { status: RemoteStatus; state: unknown }[] | null)?.[0]
  if (error || !r) return { status: 'error', state: null }
  if (r.status === 'token_rejected') forgetToken('control', code)
  return { status: r.status, state: asState(r.state) }
}

// ── 비로그인 입장 ──────────────────────────────────────
interface RawJoin {
  status: JoinStatus
  title: string | null
  control_topic?: string | null
  view_topic: string | null
  token: string | null
  state: unknown
}

async function join(kind: Kind, code: string, password?: string): Promise<Join> {
  const empty: Join = { status: 'error', title: null, controlTopic: null, viewTopic: null, state: null }
  if (!supabase) return { ...empty, error: NO_SUPABASE }
  if (password && lockedSeconds(kind, code) > 0) return { ...empty, status: 'locked' }
  const { data, error } = await supabase.rpc(kind === 'control' ? 'join_control' : 'join_view', {
    p_code: code,
    p_password: password || null,
    p_token: getToken(kind, code),
  })
  const r = (data as RawJoin[] | null)?.[0]
  if (error || !r) return { ...empty, error: error?.message ?? '응답이 없습니다' }
  if (r.status === 'token_rejected') forgetToken(kind, code)
  if (r.status === 'ok' && r.token) setToken(kind, code, r.token)
  if (password) {
    if (r.status === 'bad_password') {
      const l = readLock(kind, code)
      const fails = l.fails + 1
      writeLock(kind, code, fails >= LOCK_FAILS ? { fails: 0, until: Date.now() + LOCK_MS } : { fails, until: 0 })
      if (fails >= LOCK_FAILS) return { ...empty, status: 'locked' }
    } else if (r.status === 'ok') writeLock(kind, code, null)
  }
  return { status: r.status, title: r.title, controlTopic: r.control_topic ?? null, viewTopic: r.view_topic, state: asState(r.state) }
}

export const joinControl = (code: string, password?: string) => join('control', code, password)
export const joinView = (code: string, password?: string) => join('view', code, password)

function friendly(msg: string): string {
  if (/too short/.test(msg)) return '비밀번호는 4자 이상이어야 합니다'
  if (/invalid title/.test(msg)) return '채널 제목은 1~60자여야 합니다'
  if (/login required|permission denied/.test(msg)) return '로그인이 필요합니다'
  if (/not found/.test(msg)) return '채널을 찾을 수 없거나 이 계정의 채널이 아닙니다'
  return msg
}
