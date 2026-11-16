import { onMounted, onBeforeUnmount } from 'vue'
import type { useLive } from '@/live/liveStore'

type Live = ReturnType<typeof useLive>

/**
 * →/Space 다음 · ← 이전 · ↑/↓ 이전/다음 곡 · B 블랭크 · 1~9,0 현재 곡 N번째 · Enter 미리보기 송출(TAKE)
 * 입력창에 포커스가 있으면 동작하지 않는다(Esc 로 빠져나옴).
 */
export function useHotkeys(live: Live, extra: { focusSearch: () => void }) {
  function onKey(e: KeyboardEvent) {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    if (live.hotkeysPaused.value) return
    const t = e.target as HTMLElement | null
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    if (typing) {
      if (e.key === 'Escape') t.blur()
      return
    }
    // 버튼에 포커스가 남아 Space/Enter 가 버튼을 다시 누르는 사고 방지
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) t.blur()

    const a = live.actions
    let handled = true
    switch (e.key) {
      case 'ArrowRight': case ' ': a.next(); break
      case 'ArrowLeft': a.prev(); break
      case 'ArrowDown': a.nextSong(); break
      case 'ArrowUp': a.prevSong(); break
      case 'Enter': a.take(); break
      case 'b': case 'B': case 'ㅠ': a.toggleBlank(); break
      case '/': extra.focusSearch(); break
      default:
        if (/^[0-9]$/.test(e.key)) a.nth(e.key === '0' ? 10 : Number(e.key))
        else handled = false
    }
    if (handled) e.preventDefault()
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
