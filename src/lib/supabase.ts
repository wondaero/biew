import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * 로그인은 이 기기(localStorage)에 저장한다(2026-11-18 사용자 결정) — 로그아웃 버튼을 누를 때까지 유지.
 * 이유: 스태프 계정이 하나라 방송실 PC 를 쓰는 사람은 어차피 비밀번호를 안다 → 저장해도 새로 권한을 얻는 사람이 거의 없고,
 *   매번 로그인하지 않아도 곡 목록이 자동으로 최신이 된다. 계정을 사람마다 나누게 되면 다시 검토할 것.
 * 송출은 로그인과 무관하다 — 호스트 PC 는 채널 전용 호스트 토큰을 따로 기억한다(live/persistence.ts 의 host 기록).
 * 로그인돼 있어도 컨트롤 링크를 여는 기기가 자동으로 호스트가 되지는 않는다(ControlGate 에서 고름).
 */

/** 환경변수가 없으면 null — 그래도 캐시된 곡으로 오프라인 송출은 가능해야 한다 */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null
