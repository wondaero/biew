<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'

const live = useLive()
const root = ref<HTMLElement>()

const isLive = (i: number, j: number) => i === live.state.itemIndex && j === live.state.slideIndex
const isNext = (i: number, j: number) => live.upcoming.value?.itemIndex === i && live.upcoming.value?.slideIndex === j

function onClick(i: number, j: number) {
  live.actions.pick({ itemIndex: i, slideIndex: j })
}
function onDbl(i: number, j: number) {
  // PVW 모드에서 더블클릭 = 즉시 송출
  if (live.pvwMode.value) live.actions.go({ itemIndex: i, slideIndex: j })
}

function scrollToItem(i: number) {
  root.value?.querySelector(`[data-item="${i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// 송출 위치가 바뀌면 해당 카드가 보이도록(이미 보이면 움직이지 않음)
watch(
  () => [live.state.itemIndex, live.state.slideIndex],
  async () => {
    await nextTick()
    root.value?.querySelector('.card.live')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  },
)

defineExpose({ scrollToItem })
</script>

<template>
  <section ref="root" class="grid-wrap">
    <p v-if="!live.state.setlist.length" class="empty">콘티에 곡을 추가하면 슬라이드가 여기에 펼쳐집니다.</p>
    <div v-for="(it, i) in live.state.setlist" :key="it.key" class="song" :data-item="i">
      <h3 :class="{ live: i === live.state.itemIndex }">
        <span class="no">{{ i + 1 }}</span>{{ it.title }}
        <small>{{ it.slides.length }}장</small>
      </h3>
      <p v-if="!it.slides.length" class="noslide">슬라이드 없음</p>
      <div class="cards">
        <button
          v-for="(s, j) in it.slides"
          :key="j"
          class="card"
          :class="{ live: isLive(i, j), next: isNext(i, j), blanked: isLive(i, j) && live.state.blank }"
          @click="onClick(i, j)"
          @dblclick="onDbl(i, j)"
        >
          <span class="idx">{{ j + 1 }}</span>
          <span class="txt">{{ s }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid-wrap { overflow-y: auto; padding: 4px 8px 40vh; min-height: 0; }
.empty { color: var(--muted); text-align: center; margin-top: 30vh; }
.song { margin-bottom: 18px; scroll-margin-top: 4px; }
h3 {
  position: sticky; top: 0; z-index: 1; margin: 0 0 8px; padding: 6px 8px; font-size: 14px;
  background: var(--bg); border-bottom: 1px solid var(--line); display: flex; align-items: baseline; gap: 8px;
}
h3.live { color: #fff; border-bottom-color: var(--pgm); }
h3 .no { color: var(--muted); font-size: 12px; }
h3 small { color: var(--muted); font-weight: normal; font-size: 12px; }
.noslide { color: var(--muted); font-size: 12px; margin: 0 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.card {
  position: relative; display: flex; align-items: center; justify-content: center;
  aspect-ratio: 16 / 9; padding: 8px 10px; text-align: center; background: #0d0d10;
  border: 2px solid var(--line); border-radius: 8px; overflow: hidden;
}
.card:hover { border-color: #5a5a68; }
.card.next { border-color: var(--pvw); }
.card.live { border-color: var(--pgm); box-shadow: 0 0 0 2px rgba(255, 59, 59, .35); }
.card.blanked .txt { opacity: .35; }
.idx { position: absolute; top: 4px; left: 6px; font-size: 11px; color: var(--muted); }
.card.live .idx { color: var(--pgm); font-weight: 700; }
.txt {
  font-size: 12.5px; line-height: 1.35; white-space: pre-line; color: #ddd;
  display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;
}
</style>
