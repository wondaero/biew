/**
 * 로그인 = 공용 팝업 하나(사용자 결정 2026-11-18). 예전엔 로그인 칸이 화면마다 다른 자리에 끼어 들어갔다
 * (홈 3곳·곡 라이브러리·📡 관리·서버 올리기·인터넷 송출 전환).
 * 로그인이 필요한 곳은 requireLogin(이유) 를 부르고 결과를 기다린다 → 로그인되면 하려던 동작을 이어서.
 *  - 이미 로그인돼 있으면 바로 true.
 *  - 팝업은 App.vue 의 LoginDialog 하나가 그린다(다른 팝업 위에 겹쳐 뜸). 닫으면 false.
 */
import { ref, watch } from 'vue'
import { session } from './auth'

/** reauth: 이미 로그인돼 있어도 비밀번호를 다시 확인(아이디는 채워 둠) */
export interface LoginRequest { reason: string; resolve: (ok: boolean) => void; reauth?: boolean }
export const loginRequest = ref<LoginRequest | null>(null)

export function requireLogin(reason: string): Promise<boolean> {
  if (session.value) return Promise.resolve(true)
  loginRequest.value?.resolve(false) // 앞의 요청이 남아 있으면 정리
  return new Promise((resolve) => { loginRequest.value = { reason, resolve } })
}

/**
 * DB 와 주고받기 전 비밀번호 재확인(2026-11-19 사용자 결정 — [⬇ 다운로드]·[⬆ 업로드] 버튼을 누를 때 한 번).
 * 로그인을 이 기기에 저장해 두므로, 중요한 동작 직전에만 본인 확인을 한 번 더 한다.
 * 최근 5분 안에 비밀번호를 입력했으면(로그인·재확인) 묻지 않는다 — 다운로드 → 업로드 연달아 두 번 치지 않게.
 * 로그인돼 있지 않으면 그냥 로그인 창(같은 역할).
 */
const REAUTH_MS = 5 * 60 * 1000
// 같은 탭 안에서만 기억(sessionStorage) — 새로고침·주소 이동에도 5분은 유지, 탭을 닫으면 사라짐
const PW_KEY = 'biew.pwAt'
const passwordAt = () => { try { return Number(sessionStorage.getItem(PW_KEY)) || 0 } catch { return 0 } }
/** 비밀번호를 방금 확인함(LoginForm 이 로그인 성공 시 부름) */
export function markPasswordEntered() { try { sessionStorage.setItem(PW_KEY, String(Date.now())) } catch { /* 저장 불가 — 다음에 다시 물음 */ } }
export function requireReauth(reason: string): Promise<boolean> {
  if (session.value && Date.now() - passwordAt() < REAUTH_MS) return Promise.resolve(true)
  loginRequest.value?.resolve(false)
  return new Promise((resolve) => { loginRequest.value = { reason, resolve, reauth: true } })
}
/** 로그인 폼이 성공했을 때 — 기다리던 요청에 성공을 알림(재확인은 세션이 이미 있어 아래 watch 로는 알 수 없음) */
export function loginSucceeded() {
  markPasswordEntered()
  const r = loginRequest.value
  loginRequest.value = null
  r?.resolve(true)
}

/** 팝업을 닫음(취소) */
export function cancelLogin() {
  const r = loginRequest.value
  loginRequest.value = null
  r?.resolve(false)
}

// 로그인되면(팝업에서든 다른 곳에서든) 기다리던 쪽에 성공을 알리고 팝업을 닫는다.
// 재확인 요청은 제외 — 세션은 토큰 갱신만으로도 바뀌므로, 비밀번호를 실제로 입력했을 때(loginSucceeded)만 통과
watch(session, (s) => {
  const r = loginRequest.value
  if (s && r && !r.reauth) { loginRequest.value = null; r.resolve(true) }
})
