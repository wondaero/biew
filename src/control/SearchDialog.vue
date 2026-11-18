<script setup lang="ts">
/**
 * 곡 검색 팝업(사용자 결정 2026-11-18 — 메인은 핵심만, 자잘한 건 팝업). PC = 가운데 창, 모바일 = 아래 시트(92dvh).
 * 안에 곡 라이브러리 전체(검색·추가·동기화 상태·새 곡·✎ 수정·서버 올리기)를 그대로 쓴다(LibraryPanel).
 * 예배 중에도 빨라야 한다: '/' 로 열리고 검색칸에 바로 커서 → ↑↓ 고르고 Enter = 콘티에 추가(팝업은 열린 채 — 연달아 추가),
 * Esc = 검색어 지우기 → 한 번 더 Esc = 닫기. 열린 동안 송출 단축키는 막는다.
 */
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import LibraryPanel from './panels/LibraryPanel.vue'

const props = withDefaults(defineProps<{ startNew?: boolean }>(), { startNew: false })
const emit = defineEmits<{ close: [] }>()
const live = useLive()
const lib = ref<InstanceType<typeof LibraryPanel>>()

usePauseHotkeys()
// 안에 편집기·서버 올리기 창이 떠 있으면 그 창이 먼저 닫힌다(뒤로가기 스택·Esc 모두)
useBackClose(() => true, () => { if (!lib.value?.hasModal()) emit('close') })
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || lib.value?.hasModal()) return
  e.preventDefault()
  emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  void nextTick(() => (props.startNew ? lib.value?.newSong() : lib.value?.focus()))
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="srch-backdrop" @mousedown.self="emit('close')">
    <div class="srch" role="dialog" aria-modal="true" aria-label="곡 검색">
      <header>
        <h2>곡 검색</h2>
        <small class="keys">Enter = 콘티에 추가(계속 추가 가능) · Esc = 지우기/닫기</small>
        <span class="spacer" />
        <small class="cnt">콘티 {{ live.state.setlist.length }}곡</small>
        <button class="x" title="닫기 (Esc)" @click="emit('close')">✕</button>
      </header>
      <LibraryPanel ref="lib" class="srch-lib" />
    </div>
  </div>
</template>

<style scoped>
.srch-backdrop { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.srch {
  width: min(720px, calc(100vw - 48px)); height: min(760px, calc(100vh - 48px)); display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}
header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 16px; }
.keys, .cnt { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
.x { border: none; background: none; box-shadow: none; margin: 0; padding: 2px 8px; color: var(--muted); }
.srch-lib { flex: 1; min-height: 0; padding: 12px 14px; }
/* 모바일: 아래에서 올라오는 시트(다른 바텀시트와 같은 높이) */
@media (max-width: 768px) {
  .srch-backdrop { place-items: end stretch; }
  .srch { width: auto; height: 92dvh; border-radius: 14px 14px 0 0; border-bottom: 0; padding-bottom: env(safe-area-inset-bottom); }
  .keys { display: none; }
  .srch-lib { padding: 10px 12px; }
}
</style>
