/**
 * 받는 쪽(출력 창·넓은 화면 보기): 출력 설정 '바로 적용' 중인 임시 설정을 덮어 그린다(메시지 규칙은 SyncTransport 'style-preview').
 * 화면은 style.value ?? state.style 을 그리면 된다.
 */
import { ref, onBeforeUnmount } from 'vue'
import type { LiveState, OutputStyle } from '@shared/types'
import type { SyncMessage } from '@/sync/SyncTransport'
import { normalizeStyle } from '@shared/outputStyle'

/** 이만큼 다시 안 오면 스스로 끝(보내는 쪽은 2초마다) */
export const PREVIEW_TTL_MS = 6000

export function useStylePreview(currentVersion: () => number | undefined) {
  const style = ref<OutputStyle | null>(null)
  let lastAt = 0
  let clearAt: number | null = null

  function onMessage(m: SyncMessage) {
    if (m.type !== 'style-preview') return
    if (m.style) {
      style.value = normalizeStyle(m.style) // 보기 주소는 다른 기기도 보낼 수 있으므로 값 검사
      lastAt = Date.now()
      clearAt = null
    } else if (m.until !== undefined && (currentVersion() ?? 0) < m.until) {
      clearAt = m.until // 저장된 상태가 아직 안 옴 → 받으면 끝
    } else {
      style.value = null
      clearAt = null
    }
  }
  /** 상태를 받을 때마다 */
  function onState(s: Pick<LiveState, 'version'>) {
    if (clearAt !== null && s.version >= clearAt) { style.value = null; clearAt = null }
  }
  const timer = window.setInterval(() => {
    if (style.value && Date.now() - lastAt > PREVIEW_TTL_MS) { style.value = null; clearAt = null }
  }, 1000)
  onBeforeUnmount(() => clearInterval(timer))
  /** 채널을 갈아탈 때 등 — 임시 설정을 바로 끝 */
  function clear() { style.value = null; clearAt = null }
  return { style, onMessage, onState, clear }
}
