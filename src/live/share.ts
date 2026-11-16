/**
 * 폰 공유(뷰어). 컨트롤러 전용.
 * - rooms 행에 현재 상태를 덮어씀(늦게 들어온 폰이 바로 따라오도록) — 0.4초 디바운스
 * - Realtime Broadcast 로 즉시 전송
 * 오프라인/실패해도 로컬 출력(BroadcastChannel)에는 아무 영향 없음.
 */
import { ref, computed, watch } from 'vue'
import type { LiveState } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { session } from '@/lib/auth'
import { roomCode } from '@/lib/uid'
import { SupabaseRealtimeTransport } from '@/sync/SupabaseRealtimeTransport'

const KEY = 'biew.room.v1'
export const roomCodeRef = ref<string | null>(loadCode())
export const shareStatus = ref<'off' | 'connecting' | 'live' | 'error'>('off')
export const shareError = ref<string | null>(null)
export const viewerUrl = computed(() => (roomCodeRef.value ? `${location.origin}/view/${roomCodeRef.value}` : null))

let rt: SupabaseRealtimeTransport | null = null
let getState: () => LiveState = () => { throw new Error('share not bound') }
let timer: number | undefined

function loadCode(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function saveCode(c: string | null) {
  try { c ? localStorage.setItem(KEY, c) : localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** liveStore 가 상태 접근자를 넘겨준다 */
export function bindShare(fn: () => LiveState) {
  getState = fn
  // 새로고침 후 세션이 비동기로 복원되면 이전 방으로 자동 재연결
  watch(session, (s) => { if (s && roomCodeRef.value && !rt) connect(roomCodeRef.value) }, { immediate: true })
}

async function writeRow(code: string) {
  if (!supabase || !session.value) return
  const s = getState()
  const { error } = await supabase.from('rooms').upsert({ code, state: s, version: s.version, updated_at: new Date().toISOString() })
  if (error) { shareStatus.value = 'error'; shareError.value = error.message }
}

function connect(code: string) {
  if (!supabase) return
  rt?.close()
  shareStatus.value = 'connecting'
  shareError.value = null
  rt = new SupabaseRealtimeTransport(supabase, code, {
    sendOnly: true,
    onStatus: (st) => {
      if (st === 'SUBSCRIBED') shareStatus.value = 'live'
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') shareStatus.value = 'error'
    },
  })
  void writeRow(code)
}

/** 상태가 바뀔 때마다 liveStore 가 호출 */
export function publish(s: LiveState) {
  const code = roomCodeRef.value
  if (!code || !rt) return
  rt.send({ type: 'state', state: s })
  clearTimeout(timer)
  timer = window.setTimeout(() => void writeRow(code), 400)
}

export async function startShare(): Promise<string | null> {
  if (!supabase) return 'Supabase 설정이 없습니다'
  if (!session.value) return '로그인이 필요합니다'
  if (!navigator.onLine) return '인터넷 연결이 필요합니다'
  const code = roomCodeRef.value ?? roomCode()
  roomCodeRef.value = code
  saveCode(code)
  connect(code)
  return null
}

/** 공유 중지: 방 삭제 → 기존 링크로는 더 이상 볼 수 없음 */
export async function stopShare() {
  const code = roomCodeRef.value
  rt?.close(); rt = null
  roomCodeRef.value = null
  saveCode(null)
  shareStatus.value = 'off'
  if (code && supabase && session.value) await supabase.from('rooms').delete().eq('code', code)
}

/** 새 코드 발급(이전 링크 무효화) */
export async function rotateShare() {
  await stopShare()
  return startShare()
}
