<script setup lang="ts">
import { computed } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir, textAt } from '@/live/nav'
import SlideRender from '@/components/SlideRender.vue'

const live = useLive()
const s = live.state
/** 실제 송출 화면(FREEZE 중이면 고정된 화면) */
const air = computed(() => onAir(s))
const pgmText = computed(() => air.value.text)
const nextText = computed(() => textAt(s.setlist, live.upcoming.value))
const label = (c: { itemIndex: number; slideIndex: number } | null) =>
  c && s.setlist[c.itemIndex] ? `${s.setlist[c.itemIndex]!.title} · ${c.slideIndex + 1}/${s.setlist[c.itemIndex]!.slides.length}` : '—'
</script>

<template>
  <section class="monitors">
    <div class="mon">
      <div class="bar pgm">
        <b>송출 중</b> <span>{{ label({ itemIndex: air.itemIndex, slideIndex: air.slideIndex }) }}</span>
        <em v-if="air.frozen" class="frz">FREEZE</em>
        <em v-if="air.blank">BLANK</em>
      </div>
      <div class="screen"><SlideRender :text="pgmText" :blank="air.blank" :style-cfg="s.style" :layer-key="`${air.itemIndex}:${air.slideIndex}`" /></div>
    </div>
    <!-- 즉시 모드에선 PGM 하나만. PVW 모드에서만 'TAKE 하면 나갈 화면' 표시 -->
    <div v-if="live.pvwMode.value" class="mon">
      <div class="bar pvw">
        <b>미리보기</b> <span>{{ label(live.upcoming.value) }}</span>
        <button class="take" :disabled="!live.upcoming.value" title="미리보기를 송출 (Enter)" @click="live.actions.take()">송출 ⏎</button>
      </div>
      <div class="screen"><SlideRender :text="nextText" :style-cfg="s.style" :animate="false" /></div>
    </div>
  </section>
</template>

<style scoped>
.monitors { display: grid; gap: 10px; }
.bar { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 2px; }
.bar b { padding: 1px 6px; border-radius: 4px; color: #fff; font-size: 11px; }
.bar.pgm b { background: var(--live); color: var(--live-ink); }
.bar.pvw b { background: var(--preview); }
.bar span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
.bar em { font-style: normal; color: var(--warn); font-weight: 700; }
.bar em.frz { color: var(--freeze); }
/* 송출(TAKE) = 누르면 이게 나간다 → 송출 색(초록)으로 채움. 미리보기 색(파랑)과 구분 */
.take { padding: 4px 12px; font-size: 12px; --edge: #12803b; background-color: var(--live); border-color: #4be080; color: var(--live-ink); font-weight: 700; }
.take:hover { background-color: #34d36b; border-color: #5fe891; }
.screen { aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
</style>
