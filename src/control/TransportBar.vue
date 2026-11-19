<script setup lang="ts">
/**
 * 송출 조작 버튼 묶음(◀ ▶ BLANK FREEZE) — 예배 중 가장 자주 누르는 버튼.
 *  - PC: 위 줄 안(bar). 리모컨 PC 화면은 stretch(버튼이 줄을 채움).
 *  - 폰(≤768px): 화면 맨 아래 두 줄(bottom, 사용자 결정 2026-11-19 — 엄지가 닿는 자리).
 *      [ BLANK ][ FREEZE ]   ← 낮게
 *      [   ◀   ][   ▶   ]    ← 가장 크게. 한 줄 네 개면 280px 에서 ▶ 옆 FREEZE 를 잘못 누르기 쉬워 두 줄
 * FREEZE 는 호스트만(리모컨은 BLANK 가 한 줄을 다 씀).
 */
import { useLive } from '@/live/liveStore'

withDefaults(defineProps<{ host: boolean; bottom?: boolean; stretch?: boolean }>(), { bottom: false, stretch: false })
const live = useLive()
</script>

<template>
  <div class="group" :class="{ bottom, stretch, solo: !host }">
    <button class="nav prev" title="이전 (←)" @click="live.actions.prev()">◀&#xFE0E;</button>
    <button class="nav next" title="다음 (→ / Space)" @click="live.actions.next()">▶&#xFE0E;</button>
    <button class="blank" :class="{ on: live.state.blank }" title="자막 내리기 (B)" @click="live.actions.toggleBlank()">
      BLANK<span v-if="live.state.blank" class="off-word"> 해제</span>
    </button>
    <button
      v-if="host"
      class="freeze"
      :class="{ on: !!live.state.frozen }"
      title="송출 화면 고정 — 조작은 계속되지만 송출은 그대로 (F 로 걸기, 해제는 이 버튼)"
      @click="live.state.frozen ? live.actions.unfreeze() : live.actions.freeze()"
    >
      FREEZE<span v-if="live.state.frozen" class="off-word"> 해제</span>
    </button>
  </div>
</template>

<style scoped>
.group { display: flex; gap: 6px; }
.group button { min-height: 34px; font-weight: 600; white-space: nowrap; }
/* 3D: 색은 background-color 만(면 그라데이션 유지), 받침 색 --edge 는 더 어두운 같은 계열 */
.nav { min-width: 52px; font-size: 16px; background-color: #33333f; border-color: #4e4e5b; }
.nav:hover { background-color: #3d3d4a; border-color: #5e5e6c; }
/* 최소 폭: 켜면 글자가 'BLANK 해제'로 길어져 옆 버튼이 밀리면 예배 중 잘못 누르기 쉽다 → 폭 고정 */
.blank, .freeze { min-width: 7.6em; }
.blank { --edge: #4d3407; color: var(--warn); border-color: rgba(245, 165, 36, .5); }
.blank:hover { background-color: #3a3222; border-color: var(--warn); }
.freeze { --edge: #0b3a50; color: var(--freeze); border-color: rgba(56, 189, 248, .5); }
.freeze:hover { background-color: #1f3340; border-color: var(--freeze); }
.blank.on, .blank.on:hover { --edge: #93600c; background-color: var(--warn); border-color: #ffc25a; color: #222; font-weight: 700; }
.freeze.on, .freeze.on:hover { --edge: #13729b; background-color: var(--freeze); border-color: #7dd6fb; color: #04212e; font-weight: 700; }
@media (max-width: 1150px) { .blank, .freeze { min-width: 0; } }

/* 리모컨 PC 화면: 버튼이 줄을 채움 */
.stretch { flex: 1; }
.stretch button { flex: 1; padding: 10px 12px; }

/* 폰: 맨 아래 두 줄 — 위 BLANK·FREEZE(낮게), 아래 ◀ ▶(크게). 제스처 막대와 겹치지 않게 아래 여백 */
.bottom {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 8px;
  grid-template-areas: 'blank freeze' 'prev next';
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); background: var(--panel); border-top: 1px solid var(--line);
}
.bottom.solo { grid-template-areas: 'blank blank' 'prev next'; }
.bottom button { min-width: 0; margin-bottom: var(--lift); }
.bottom .blank { grid-area: blank; min-height: 42px; }
.bottom .freeze { grid-area: freeze; min-height: 42px; }
.bottom .prev { grid-area: prev; }
.bottom .next { grid-area: next; }
.bottom .nav { min-height: 56px; font-size: 22px; }
</style>
