<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { SetlistItem } from '@shared/types'
import { useLive } from '@/live/liveStore'
import { onAir } from '@/live/nav'
import { useLibrary } from '@/library/library'
import { isMediaItem } from '@shared/media'
import { removeItemAsk, clearAsk, isChanged } from '../setlistChanges'

const live = useLive()
const lib = useLibrary()

/** 라이브러리의 곡이 선곡에 넣은 뒤 수정됐는지 */
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
const emit = defineEmits<{ jump: [itemIndex: number]; history: [] }>()

// 드래그 결과를 그대로 store 에 반영(송출 중 곡 위치는 store 가 key 로 보정)
const list = computed<SetlistItem[]>({
  get: () => live.state.setlist as SetlistItem[],
  set: (v) => live.setlist.replace(v),
})

/** 빼기·비우기 — 오늘 고친 곡이 있으면 저장/버리기를 묻는다(src/control/setlistChanges.ts) */
async function remove(it: SetlistItem) {
  const r = await removeItemAsk(it)
  if (r?.warn) alert(r.text)
}
async function clear() {
  const r = await clearAsk()
  if (r?.warn) alert(r.text)
}
</script>

<template>
  <section class="setlist">
    <header>
      <h2>선곡 <small>{{ list.length }}곡</small></h2>
      <button v-if="live.role.value === 'host'" class="ghost hist" title="선곡 기록 — 지난 예배 선곡 보기·복사해서 시작, 지금 선곡 기록" @click="emit('history')">📜 기록</button>
      <button v-if="list.length" class="ghost danger-line" @click="clear">비우기</button>
    </header>
    <VueDraggable v-model="list" :animation="150" handle=".grip" tag="ol" class="items">
      <li
        v-for="(it, i) in list"
        :key="it.key"
        :class="{ live: i === onAir(live.state).itemIndex }"
        @click="emit('jump', i)"
      >
        <span class="grip" title="드래그해서 순서 변경" aria-label="순서 바꾸기"><svg viewBox="0 0 14 10" width="14" height="10" aria-hidden="true"><path d="M1 2.5h12M1 7.5h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></span>
        <span class="no">{{ i + 1 }}</span>
        <span class="title"><span v-if="isMediaItem(it)" class="pic" title="그림(PDF·이미지)">🖼</span>{{ it.title }}<span v-if="isChanged(it)" class="chg" title="오늘 바꾼 슬라이드가 곡 원본에 저장되지 않음 — 슬라이드 목록의 곡 제목 줄 [저장]">•</span></span>
        <button v-if="latest(it)" class="upd" title="라이브러리에서 수정된 최신 가사로 갱신" @click.stop="refresh(it)">↻ 최신</button>
        <span class="n">{{ it.slides.length }}</span>
        <button class="x" title="선곡에서 빼기" @click.stop="remove(it)">✕</button>
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
.ghost { font-size: 14px; white-space: nowrap; }
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
.pic { margin-right: 4px; }
.n { font-size: 11px; color: var(--muted); }
.upd { font-size: 14px; color: var(--warn); --edge: #2e260f; border-color: #5a4a1e; background-color: rgba(245, 165, 36, .08); white-space: nowrap; }
.x { padding: 0 6px; border: none; background: none; color: var(--muted); box-shadow: none; margin: 0; }
.x:hover { color: var(--pgm); }
.empty { color: var(--muted); font-size: 12px; margin: 0; }
.hist { margin-right: 6px; }
.chg { color: var(--warn); font-weight: 700; margin-left: 4px; }
</style>
