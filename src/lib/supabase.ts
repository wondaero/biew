import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * 로그인은 저장하지 않는다(메모리에만). 새로고침·탭 닫기 = 로그아웃.
 * 방송실 공용 PC 에 곡 수정·채널 관리 권한이 로그인된 채로 남지 않게 하려는 것.
 * 송출은 로그인과 무관하다 — 호스트 PC 는 채널 주소(topic)를 따로 기억한다(live/persistence.ts 의 host 기록).
 * ID/PW 는 브라우저 비밀번호 저장 기능으로 자동 입력(앱이 비밀번호를 저장하지 않음).
 */
// 예전 버전이 localStorage 에 남긴 로그인 토큰 정리
try {
  for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token$/.test(k)) localStorage.removeItem(k)
} catch { /* private mode */ }

/** 환경변수가 없으면 null — 그래도 캐시된 곡으로 오프라인 송출은 가능해야 한다 */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } })
  : null
