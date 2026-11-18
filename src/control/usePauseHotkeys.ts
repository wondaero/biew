/**
 * 팝업이 열린 동안 송출 단축키 막기. 닫힐 때는 '열기 전 상태'로 되돌린다.
 * 팝업이 겹칠 수 있어서(곡 검색 팝업 → 곡 편집기·서버 올리기, 출력 설정 → 로그인) 무조건 false 로 풀면
 * 안쪽 팝업을 닫는 순간 바깥 팝업이 아직 열려 있는데도 송출 단축키가 살아난다.
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { useLive } from '@/live/liveStore'

export function usePauseHotkeys() {
  const live = useLive()
  let before = false
  onMounted(() => { before = live.hotkeysPaused.value; live.hotkeysPaused.value = true })
  onBeforeUnmount(() => { live.hotkeysPaused.value = before })
}
