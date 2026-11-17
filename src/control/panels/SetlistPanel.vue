<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { SetlistItem } from '@shared/types'
import { useLive } from '@/live/liveStore'
import { useLibrary } from '@/library/library'

const live = useLive()
const lib = useLibrary()

/** 라이브러리의 곡이 콘티에 넣은 뒤 수정됐는지 */
function latest(it: SetlistItem) {
  const s = lib.byId.value.get(it.songId)
  if (!s) return null
  const changed = s.title !== it.title || s.slides.length !== it.slides.length || s.slides.some((x, i) => x !== it.slides[i])
  return changed ? s : null
}
function refresh(it: SetlistItem) {
  const s = latest(it)
  if (s) live.setlist.refresh(it.key, s)
}
const emit = defineEmits<{ jump: [itemIndex: number] }>()

// 드래그 결과를 그대로 store 에 반영(송출 중 곡 위치는 store 가 key 로 보정)
const list = computed<SetlistItem[]>({
  get: () => live.state.setlist as SetlistItem[],
  set: (v) => live.setlist.replace(v),
})

function remove(it: SetlistItem, i: number) {
  if (i === live.state.itemIndex && !confirm(`송출 중인 "${it.title}"을(를) 콘티에서 뺄까요? 자막이 내려갑니다.`)) return
  live.setlist.remove(it.key)
}
function clear() {
  if (confirm('콘티를 모두 비울까요?')) live.setlist.clear()
}
</script>

<template>
  <section class="setlist">
    <header>
      <h2>콘티 <small>{{ list.length }}곡</small></h2>
      <button v-if="list.length" class="ghost" @click="clear">비우기</button>
    </header>
    <VueDraggable v-model="list" :animation="150" handle=".grip" tag="ol" class="items">
      <li
        v-for="(it, i) in list"
        :key="it.key"
        :class="{ live: i === live.state.itemIndex }"
        @click="emit('jump', i)"
      >
        <span class="grip" title="드래그해서 순서 변경">⋮⋮</span>
        <span class="no">{{ i + 1 }}</span>
        <span class="title">{{ it.title }}</span>
        <button v-if="latest(it)" class="upd" title="라이브러리에서 수정된 최신 가사로 갱신" @click.stop="refresh(it)">↻ 최신</button>
        <span class="n">{{ it.slides.length }}</span>
        <button class="x" title="콘티에서 빼기" @click.stop="remove(it, i)">✕</button>
      </li>
    </VueDraggable>
    <p v-if="!list.length" class="empty">검색 결과를 클릭(또는 Enter)해서 곡을 추가하세요.</p>
  </section>
</template>

<style scoped>
.setlist { display: flex; flex-direction: column; min-height: 0; gap: 6px; }
header { display: flex; align-items: center; }
header h2 { margin: 0; font-size: 14px; flex: 1; }
header small { color: var(--muted); font-weight: normal; margin-left: 4px; }
.ghost { padding: 2px 8px; font-size: 12px; }
.items { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; flex: 1; }
.items li { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 5px; cursor: pointer; border-left: 3px solid transparent; }
.items li:hover { background: var(--panel-2); }
.items li.live { border-left-color: var(--live); background: var(--live-bg); }
.grip { cursor: grab; color: var(--muted); letter-spacing: -3px; padding: 0 2px; touch-action: none; }
@media (max-width: 768px) {
  .items li { padding: 10px 6px; }
  .grip { padding: 0 8px; }
  .x { padding: 4px 10px; }
}
.no { width: 18px; color: var(--muted); font-size: 12px; text-align: right; }
.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.n { font-size: 11px; color: var(--muted); }
.upd { padding: 0 6px; font-size: 11px; color: var(--warn); border-color: #5a4a1e; background: none; white-space: nowrap; }
.x { padding: 0 6px; border: none; background: none; color: var(--muted); }
.x:hover { color: var(--pgm); }
.empty { color: var(--muted); font-size: 12px; margin: 0; }
</style>
