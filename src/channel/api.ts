/**
 * 채널 서버 API (supabase/migrations/20261117000000_channels.sql 의 테이블·RPC 래퍼).
 * - 만들기/목록/삭제/호스트 topic/접속 끊기: 로그인한 소유 계정(로그인은 저장되지 않으므로 그때마다 로그인)
 * - join_control / join_view: 비로그인 가능. 비밀번호 확인 후 서버가 기기 토큰을 주고, 이 브라우저(localStorage)가 보관한다.
 *   토큰은 채널별·종류별로 저장되고, 서버가 거부(만료/접속 끊기)하면 지운다.
 * 송출 상태는 서버에 없다 — 늦게 들어온 기기는 실시간 채널에서 호스트에게 직접 요청한다(channel/sync.ts).
 */
import { supabase } from '@/lib/supabase'

export interface ChannelRow { code: string; title: string; has_view_password: boolean; created_at: string }
export type Kind = 'control' | 'view'
export type JoinStatus = 'ok' | 'not_found' | 'password_required' | 'token_rejected' | 'bad_password' | 'locked' | 'error'

export interface Join {
  status: JoinStatus
  title: string | null
  controlTopic: string | null
  viewTopic: string | null
  error?: string
}

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

export async function channelTopics(code: string): Promise<{ controlTopic: string; viewTopic: string } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('channel_topics', { p_code: code })
  const r = (data as { control_topic: string; view_topic: string }[] | null)?.[0]
  if (error || !r) return null
  return { controlTopic: r.control_topic, viewTopic: r.view_topic }
}

/** 모든 기기 접속 끊기 + (선택) 비밀번호 변경. 새 topic 을 돌려준다(호스트 PC 는 이것을 다시 기억) */
export async function resetAccess(
  code: string,
  o: { controlPassword?: string; viewPassword?: string; removeViewPassword?: boolean } = {},
): Promise<{ topics?: { controlTopic: string; viewTopic: string }; error?: string }> {
  if (!supabase) return { error: NO_SUPABASE }
  const { data, error } = await supabase.rpc('reset_channel_access', {
    p_code: code,
    p_control_password: o.controlPassword || null,
    p_view_password: o.viewPassword || null,
    p_remove_view_password: !!o.removeViewPassword,
  })
  if (error) return { error: friendly(error.message) }
  const r = (data as { control_topic: string; view_topic: string }[] | null)?.[0]
  return r ? { topics: { controlTopic: r.control_topic, viewTopic: r.view_topic } } : { error: '응답이 없습니다' }
}

// ── 비로그인 입장 ──────────────────────────────────────
interface RawJoin {
  status: JoinStatus
  title: string | null
  control_topic?: string | null
  view_topic: string | null
  token: string | null
}

async function join(kind: Kind, code: string, password?: string): Promise<Join> {
  const empty: Join = { status: 'error', title: null, controlTopic: null, viewTopic: null }
  if (!supabase) return { ...empty, error: NO_SUPABASE }
  const { data, error } = await supabase.rpc(kind === 'control' ? 'join_control' : 'join_view', {
    p_code: code,
    p_password: password || null,
    p_token: getToken(kind, code),
  })
  const r = (data as RawJoin[] | null)?.[0]
  if (error || !r) return { ...empty, error: error?.message ?? '응답이 없습니다' }
  if (r.status === 'token_rejected') forgetToken(kind, code)
  if (r.status === 'ok' && r.token) setToken(kind, code, r.token)
  return { status: r.status, title: r.title, controlTopic: r.control_topic ?? null, viewTopic: r.view_topic }
}

export const joinControl = (code: string, password?: string) => join('control', code, password)
export const joinView = (code: string, password?: string) => join('view', code, password)

function friendly(msg: string): string {
  if (/too short/.test(msg)) return '비밀번호는 4자 이상이어야 합니다'
  if (/invalid title/.test(msg)) return '채널 제목은 1~60자여야 합니다'
  if (/login required/.test(msg)) return '로그인이 필요합니다'
  if (/permission denied/.test(msg)) return '로그인이 필요합니다'
  return msg
}
