import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/control' },
    { path: '/control', component: () => import('./control/ControlView.vue') },
    { path: '/output', component: () => import('./output/OutputView.vue') },
    { path: '/view', component: () => import('./viewer/JoinView.vue') },
    { path: '/view/:code', component: () => import('./viewer/ViewerView.vue') },
  ],
})
