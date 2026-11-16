import { onMounted, onBeforeUnmount, ref } from 'vue'

/** 화면 꺼짐 방지. 탭이 다시 보일 때마다 재획득(브라우저가 자동 해제하므로). */
export function useWakeLock() {
  const active = ref(false)
  let lock: WakeLockSentinel | null = null

  async function acquire() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      lock = await navigator.wakeLock.request('screen')
      active.value = true
      lock.addEventListener('release', () => { active.value = false })
    } catch { active.value = false }
  }
  const onVis = () => { if (document.visibilityState === 'visible') acquire() }

  onMounted(() => { acquire(); document.addEventListener('visibilitychange', onVis) })
  onBeforeUnmount(() => { document.removeEventListener('visibilitychange', onVis); lock?.release() })
  return { active }
}
