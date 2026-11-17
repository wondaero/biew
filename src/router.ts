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
