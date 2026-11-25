<script setup lang="ts">
/**
 * 폰 전체 화면 팝업 머리 아래 "● 송출 중: 곡명 3/5" 한 줄(사용자 결정 2026-11-19).
 * 전체 화면 팝업은 송출 모니터를 완전히 가리므로, 곡 목록·선곡·설정을 보는 동안에도 지금 나가는 것을 알 수 있게.
 * PC(>768px)에선 숨김 — 팝업 뒤로 사이드바 송출 화면이 보인다. 송출 = onAir(FREEZE 중이면 고정된 화면).
 */
import { computed } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir } from '@/live/nav'

const live = useLive()
const air = computed(() => onAir(live.state))
const item = computed(() => live.state.setlist[air.value.itemIndex])
const kind = computed(() => (!item.value ? 'none' : air.value.frozen ? 'frozen' : air.value.blank ? 'blank' : 'live'))
const tag = computed(() => (kind.value === 'live' && air.value.slideIndex < 0 ? '○ 송출 대기' : ({ none: '송출 없음', frozen: '❄ FREEZE', blank: '● BLANK', live: '● 송출 중' })[kind.value]))
</script>

<template>
  <p class="onair-strip" :class="kind" role="status">
    <b>{{ tag }}</b>
    <span v-if="item">{{ item.title }}{{ air.slideIndex < 0 ? '' : ` · ${air.slideIndex + 1}/${item.slides.length}` }}</span>
  </p>
</template>

<style scoped>
.onair-strip { display: none; }
@media (max-width: 768px) {
  .onair-strip {
    display: flex; gap: 8px; align-items: baseline; margin: 0; padding: 6px 12px; font-size: 13px;
    background: var(--live-bg); border-bottom: 1px solid var(--line); color: var(--muted); min-width: 0;
  }
  .onair-strip b { color: var(--live); white-space: nowrap; }
  .onair-strip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .onair-strip.blank { background: rgba(245, 165, 36, .08); }
  .onair-strip.blank b { color: var(--warn); }
  .onair-strip.frozen { background: rgba(56, 189, 248, .08); }
  .onair-strip.frozen b { color: var(--freeze); }
  .onair-strip.none { background: none; }
  .onair-strip.none b { color: var(--muted); font-weight: normal; }
}
</style>
