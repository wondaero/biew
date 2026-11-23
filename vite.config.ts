import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

/** 화면에 보이는 버전: 빌드 시각 + 커밋(Vercel 은 VERCEL_GIT_COMMIT_SHA, 로컬은 git) — 홈 하단에 표시 */
function gitCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'dev' }
}

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify({ time: new Date().toISOString(), commit: gitCommit() }),
  },
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
        // woff2 = 송출 글꼴(Pretendard, 앱에 포함) — 오프라인에서도 모든 PC 에 같은 글꼴
        // mjs = PDF 변환(pdf.js worker) — 오프라인에서도 PDF 를 넣을 수 있게
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico,webmanifest,woff2}'],
        // 기본 한도 2MiB 를 넘는 파일은 조용히 빠진다 — PretendardVariable.woff2(약 2.0MB)가 빠지지 않게
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // SPA: /control/ABC234 같은 주소도 오프라인에서 index.html 로
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // 개발 서버: pdf.js 는 처음 PDF 를 넣을 때에야 불러오므로, 그때 의존성 최적화 → 페이지 전체 새로고침이 일어나지 않게 미리
  optimizeDeps: { include: ['pdfjs-dist'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  // service_role 등 비공개 키가 번들에 들어가지 않도록 VITE_ 접두사만 노출 (기본값 명시)
  envPrefix: 'VITE_',
})
