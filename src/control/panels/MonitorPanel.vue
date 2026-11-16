<script setup lang="ts">
import { computed } from 'vue'
import { useLive } from '@/live/liveStore'
import { currentText, textAt } from '@/live/nav'
import SlideRender from '@/components/SlideRender.vue'

const live = useLive()
const s = live.state
const pgmText = computed(() => currentText(s))
const nextText = computed(() => textAt(s.setlist, live.upcoming.value))
const label = (c: { itemIndex: number; slideIndex: number } | null) =>
  c && s.setlist[c.itemIndex] ? `${s.setlist[c.itemIndex]!.title} · ${c.slideIndex + 1}/${s.setlist[c.itemIndex]!.slides.length}` : '—'
</script>

<template>
  <section class="monitors">
    <div class="mon">
      <div class="bar pgm">
        <b>PGM</b> <span>{{ label({ itemIndex: s.itemIndex, slideIndex: s.slideIndex }) }}</span>
        <em v-if="s.blank">BLANK</em>
      </div>
      <div class="screen"><SlideRender :text="pgmText" :blank="s.blank" :style-cfg="s.style" :layer-key="`${s.itemIndex}:${s.slideIndex}`" /></div>
    </div>
    <!-- 즉시 모드에선 PGM 하나만. PVW 모드에서만 'TAKE 하면 나갈 화면' 표시 -->
    <div v-if="live.pvwMode.value" class="mon">
      <div class="bar pvw">
        <b>PVW</b> <span>{{ label(live.upcoming.value) }}</span>
        <button class="take" :disabled="!live.upcoming.value" @click="live.actions.take()">TAKE ⏎</button>
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
.take { padding: 2px 8px; font-size: 12px; background: var(--preview); border-color: var(--preview); color: #fff; font-weight: 700; }
.screen { aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
</style>
