/**
 * 로그인 = 공용 팝업 하나(사용자 결정 2026-11-18). 예전엔 로그인 칸이 화면마다 다른 자리에 끼어 들어갔다
 * (홈 3곳·곡 라이브러리·📡 관리·서버 올리기·인터넷 송출 전환).
 * 로그인이 필요한 곳은 requireLogin(이유) 를 부르고 결과를 기다린다 → 로그인되면 하려던 동작을 이어서.
 *  - 이미 로그인돼 있으면 바로 true.
 *  - 팝업은 App.vue 의 LoginDialog 하나가 그린다(다른 팝업 위에 겹쳐 뜸). 닫으면 false.
 */
import { ref, watch } from 'vue'
import { session } from './auth'

export interface LoginRequest { reason: string; resolve: (ok: boolean) => void }
export const loginRequest = ref<LoginRequest | null>(null)

export function requireLogin(reason: string): Promise<boolean> {
  if (session.value) return Promise.resolve(true)
  loginRequest.value?.resolve(false) // 앞의 요청이 남아 있으면 정리
  return new Promise((resolve) => { loginRequest.value = { reason, resolve } })
}

/** 팝업을 닫음(취소) */
export function cancelLogin() {
  const r = loginRequest.value
  loginRequest.value = null
  r?.resolve(false)
}

// 로그인되면(팝업에서든 다른 곳에서든) 기다리던 쪽에 성공을 알리고 팝업을 닫는다
watch(session, (s) => {
  const r = loginRequest.value
  if (s && r) { loginRequest.value = null; r.resolve(true) }
})
