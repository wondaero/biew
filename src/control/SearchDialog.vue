<script setup lang="ts">
/**
 * 곡 검색 팝업(사용자 결정 2026-11-18 — 메인은 핵심만, 자잘한 건 팝업). PC = 가운데 창, 모바일 = 아래 시트(92dvh).
 * 안에 곡 라이브러리 전체(검색·추가·동기화 상태·새 곡·✎ 수정·서버 올리기)를 그대로 쓴다(LibraryPanel).
 * 예배 중에도 빨라야 한다: '/' 로 열리고 검색칸에 바로 커서 → ↑↓ 고르고 Enter = 선곡에 추가(팝업은 열린 채 — 연달아 추가),
 * Esc = 검색어 지우기 → 한 번 더 Esc = 닫기. 열린 동안 송출 단축키는 막는다.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import LibraryPanel from './panels/LibraryPanel.vue'
import OnAirStrip from './OnAirStrip.vue'

const props = withDefaults(defineProps<{ startNew?: boolean }>(), { startNew: false })
const emit = defineEmits<{ close: [] }>()
const live = useLive()
const lib = ref<InstanceType<typeof LibraryPanel>>()

/**
 * 아래 줄(2026-11-26 사용자 요청 — 다 넣고 결국 위 ✕ 로 닫아야 해서): 곡은 지금처럼 [+ 선곡] 즉시 들어가고,
 * 아래에 '이번에 추가 N곡 [되돌리기] [완료]'. [적용]/[취소] 방식(눌러야 들어감)은 쓰지 않음 — 예배 중 한 단계 늘고,
 * ✕·Esc·뒤로가기로 닫을 때 넣은 곡이 사라질지 애매해서. 되돌리기 = 이 창을 연 동안 선곡에 새로 들어온 것만 뺀다.
 */
const before = new Set(live.state.setlist.map((it) => it.key))
const added = computed(() => live.state.setlist.filter((it) => !before.has(it.key)))
function undoAdded() {
  const list = added.value
  if (!list.length) return
  const onAir = list.some((it) => live.state.setlist[live.state.itemIndex]?.key === it.key && live.state.slideIndex >= 0)
  const names = list.map((it) => `· ${it.title}`).join('\n')
  const warn = onAir ? '\n\n송출 중인 곡이 있어 자막이 내려갑니다.' : ''
  if (!confirm(`이번에 추가한 ${list.length}곡을 선곡에서 뺄까요?\n${names}${warn}`)) return
  const drop = new Set(list.map((it) => it.key))
  live.setlist.replace(live.state.setlist.filter((it) => !drop.has(it.key)))
}

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
    <div class="srch m-full" role="dialog" aria-modal="true" aria-label="곡 목록">
      <header>
        <h2>곡 목록</h2>
        <small class="keys">곡 누르기 = 보기·수정 · [+ 선곡] 또는 Enter = 선곡에 추가 · Esc = 지우기/닫기</small>
        <span class="spacer" />
        <small class="cnt">선곡 {{ live.state.setlist.length }}곡</small>
        <button class="x" title="닫기 (Esc)" @click="emit('close')">✕</button>
      </header>
      <OnAirStrip />
      <LibraryPanel ref="lib" class="srch-lib" />
      <footer class="srch-foot">
        <span class="added" :class="{ none: !added.length }" :title="added.map((it) => it.title).join(', ')">
          <template v-if="added.length"><b><span class="wide">이번에 </span>추가 {{ added.length }}곡</b><span class="names"> · {{ added.map((it) => it.title).join(', ') }}</span></template>
          <template v-else>이번에 추가한 곡 없음</template>
        </span>
        <button v-if="added.length" class="danger-line undo-added" title="이 창을 연 동안 선곡에 넣은 곡만 다시 빼기" @click="undoAdded">되돌리기</button>
        <button class="primary done" @click="emit('close')">{{ added.length ? '완료' : '닫기' }}</button>
      </footer>
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
.srch-foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); background: var(--panel); }
.added { flex: 1; min-width: 0; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.added b { color: var(--live); }
.added.none { color: var(--muted); }
.srch-foot button { font-size: 14px; white-space: nowrap; }
.done { min-width: 76px; }
/* 모바일: 전체 화면(.m-full, src/style.css) */
@media (max-width: 768px) {
  .keys { display: none; }
  .srch-lib { padding: 10px 12px; }
  .srch-foot { padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }
}
/* 좁은 폰: 곡 수가 잘리지 않게 "추가 N곡"만(곡 이름은 위 알림·선곡에서 보임) */
@media (max-width: 400px) {
  .added .wide, .added .names { display: none; }
}
</style>
