/**
 * PWA 등록. 앱 파일을 PC 에 저장해 두고(서비스 워커), 인터넷이 없어도 앱이 열리게 한다.
 * 새 버전은 자동으로 바꾸지 않는다 — needRefresh 알림을 띄우고 사용자가 누를 때 적용(예배 중 화면이 바뀌지 않게).
 * 브라우저가 디스크 부족 시 사이트 데이터(앱 파일·곡 캐시)를 지우지 않도록 영구 저장도 요청한다.
 */
import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

export const needRefresh = ref(false)
let update: ((reload?: boolean) => Promise<void>) | null = null

export function initPwa() {
  if (!('serviceWorker' in navigator)) return
  update = registerSW({
    onNeedRefresh() { needRefresh.value = true },
    onRegisteredSW(_url, reg) {
      // 오래 켜 두는 방송실 PC 도 새 버전을 알 수 있게 1시간마다 확인(오프라인이면 조용히 실패)
      if (reg) setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}) }, 60 * 60 * 1000)
    },
  })
  navigator.storage?.persist?.().catch(() => {})
}

/** 새 버전 적용 — 이 창이 새로고침된다 */
export function applyUpdate() {
  void update?.(true)
}
