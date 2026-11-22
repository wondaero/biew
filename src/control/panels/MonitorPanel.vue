<script setup lang="ts">
import { computed } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir, textAt } from '@/live/nav'
import SlideRender from '@/components/SlideRender.vue'
import { useStyleDraft } from '@/live/styleDraft'

const live = useLive()
/** 송출 화면을 누르면 목록에서 송출 중인 장으로 스크롤(ControlView → SlideGrid.scrollToLive) */
const emit = defineEmits<{ jump: [] }>()
const s = live.state
/** 송출 화면에 실제로 보이는 설정 — 출력 설정 '바로 적용' 중이면 저장 전 설정(styleDraft) */
const airStyle = useStyleDraft().onAirStyle
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
      <div class="screen jump" title="누르면 목록에서 송출 중인 장으로" @click="emit('jump')"><SlideRender :text="pgmText" :blank="air.blank" :style-cfg="airStyle" :layer-key="`${air.itemIndex}:${air.slideIndex}`" /></div>
    </div>
    <!-- 즉시 모드에선 PGM 하나만. PVW 모드에서만 'TAKE 하면 나갈 화면' 표시 -->
    <div v-if="live.pvwMode.value" class="mon">
      <div class="bar pvw">
        <b>미리보기</b> <span>{{ label(live.upcoming.value) }}</span>
        <button class="take" :disabled="!live.upcoming.value" title="미리보기를 송출 (Enter)" @click="live.actions.take()">송출<span class="take-key"> ⏎</span></button>
      </div>
      <div class="screen"><SlideRender :text="nextText" :style-cfg="airStyle" :animate="false" /></div>
    </div>
  </section>
</template>

<style scoped>
.monitors { display: grid; gap: 10px; }
/* 머리줄 높이 고정 — 송출 중/미리보기 두 화면이 나란히 있을 때(폰) 화면 위치가 맞게. 글자는 꺾지 않음 */
.bar { display: flex; align-items: center; gap: 8px; height: 34px; margin-bottom: 6px; font-size: 12px; padding: 0 2px; min-width: 0; } /* 아래 6px = 송출 버튼 받침과 화면 사이 여백(양쪽 같게 — 두 화면 위치 맞춤) */
.bar b { flex: none; padding: 1px 6px; border-radius: 4px; color: #fff; font-size: 11px; white-space: nowrap; }
.bar.pgm b { background: var(--live); color: var(--live-ink); }
.bar.pvw b { background: var(--preview); }
.bar span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
.bar em { font-style: normal; color: var(--warn); font-weight: 700; }
.bar em.frz { color: var(--freeze); }
/* 송출(TAKE) = 누르면 이게 나간다 → 송출 색(초록)으로 채움. 미리보기 색(파랑)과 구분 */
.take { flex: none; padding: 3px 12px; margin-bottom: 0; white-space: nowrap; line-height: 1.3; font-size: 14px; --edge: #12803b; background-color: var(--live); border-color: #4be080; color: var(--live-ink); font-weight: 700; }
/* 아주 좁은 폰(≤360px, 두 화면 나란히): 미리보기 쪽 곡 이름·⏎ 생략 — 송출 버튼이 화면 밖으로 밀리지 않게 */
@media (max-width: 360px) {
  .bar.pvw span:not(.take-key) { display: none; }
  .take-key { display: none; }
  .bar.pvw { justify-content: space-between; }
}
.take:hover { background-color: #34d36b; border-color: #5fe891; }
.screen.jump { cursor: pointer; }
.screen { aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
</style>
