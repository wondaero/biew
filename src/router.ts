import { createRouter, createWebHistory } from 'vue-router'

/**
 * 채널 구조: 채널 하나 = 번호(6자) 하나.
 *  /                  채널 만들기·목록(로그인) + 번호로 입장
 *  /control/:code     호스트(채널 만든 계정) 또는 리모컨(컨트롤 비밀번호)
 *  /local             오프라인 모드: 채널·서버 없이 이 PC 하나에서만(출력은 /output/LOCAL)
 *  /output/:code      송출 화면(같은 PC 의 컨트롤러와 BroadcastChannel)
 *  /view/:code        보기(선택적 보기 비밀번호)
 * 번호 없는 예전 주소(/control, /output, /view)는 홈으로.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./home/HomeView.vue') },
    { path: '/control/:code', component: () => import('./control/ControlGate.vue') },
    { path: '/local', component: () => import('./control/LocalView.vue') },
    { path: '/output/:code', component: () => import('./output/OutputView.vue') },
    { path: '/view/:code', component: () => import('./viewer/ViewerView.vue') },
    { path: '/control', redirect: '/' },
    { path: '/output', redirect: '/' },
    { path: '/view', redirect: '/' },
  ],
})

/**
 * 새 버전 적용(다른 창에서 '지금 적용') 뒤, 아직 옛 버전으로 떠 있는 창이 다른 화면으로 이동하면
 * 그 화면의 옛 파일이 이미 지워져 열리지 않는다 → 그 주소로 한 번 새로고침해 새 버전으로 연다.
 * 10초 안에 또 실패하면 다시 새로고침하지 않는다(무한 새로고침 방지).
 */
const CHUNK_ERR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
const RELOAD_KEY = 'biew.chunkReload'
function reloadOnce(path: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 10_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* private mode: 그래도 한 번은 시도 */ }
  location.assign(path)
  return true
}
// 주의: 'vite:preloadError' 에서 preventDefault 하면 오류가 삼켜져 여기까지 오지 않는다 → 그 이벤트는 건드리지 않는다
router.onError((err: unknown, to) => {
  if (CHUNK_ERR.test(String((err as Error)?.message ?? err))) reloadOnce(to.fullPath)
})
