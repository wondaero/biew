/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/** 빌드 정보(vite.config.ts define) — 홈 하단 버전 표시 */
declare const __APP_BUILD__: { time: string; commit: string }
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const c: DefineComponent<object, object, unknown>
  export default c
}
