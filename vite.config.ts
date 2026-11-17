import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    /**
     * PWA: 앱 파일 전체를 PC 에 저장(precache) → 한 번 온라인에서 열어 두면 인터넷 없이도 앱이 열린다.
     * 송출(컨트롤러↔출력 창)은 원래 서버를 거치지 않으므로, 이걸로 '인터넷 없이 처음부터 끝까지' 가 된다.
     * registerType 'prompt': 새 버전은 바로 바꾸지 않고 알림 → 누를 때 적용(예배 중 새로고침해도 화면이 바뀌지 않게).
     * Supabase 요청(곡·채널·Realtime)은 캐시하지 않는다 — 데이터는 앱이 IndexedDB/localStorage 로 직접 관리.
     */
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // 등록은 src/pwa.ts 에서(업데이트 알림 UI 와 함께)
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Biew — 예배 가사 자막',
        short_name: 'Biew',
        description: '예배 가사 자막 송출',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#141418',
        theme_color: '#141418',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // SPA: /control/ABC234 같은 주소도 오프라인에서 index.html 로
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  // service_role 등 비공개 키가 번들에 들어가지 않도록 VITE_ 접두사만 노출 (기본값 명시)
  envPrefix: 'VITE_',
})
