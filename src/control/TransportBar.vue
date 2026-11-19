<script setup lang="ts">
/**
 * 송출 조작 버튼 묶음(◀ ▶ BLANK FREEZE) — 예배 중 가장 자주 누르는 버튼.
 * 아이콘은 직접 그린 SVG(2026-11-19 사용자 결정) — 문자(❄ ◀)는 기기마다 컬러 이모지로 그려질 수 있어서.
 *   BLANK = 눈에 빗금(자막 숨김), FREEZE = 눈꽃, 이전/다음 = 삼각형. 켜짐은 지금처럼 채운 색(노랑/하늘색).
 *  - PC: 위 줄 안(bar) — 아이콘 + 글자("❄ FREEZE"). 리모컨 PC 화면은 stretch(버튼이 줄을 채움).
 *  - 폰(≤768px): 화면 맨 아래 한 줄(bottom) — 아이콘만, 모두 같은 폭. [BLANK][FREEZE][◀][▶]
 *      ▶(가장 많이 누름)를 엄지 자리 오른쪽 끝에, 바로 옆은 ◀ — 잘못 눌러도 한 장 뒤로 갈 뿐. (▶ 만 넓게 했다가 오류처럼 보여 같은 폭으로)
 *      BLANK·FREEZE 는 왼쪽으로 떨어뜨림(실수로 자막이 꺼지는 게 가장 큰 사고).
 * FREEZE 는 호스트만(리모컨은 BLANK 하나).
 */
import { useLive } from '@/live/liveStore'

withDefaults(defineProps<{ host: boolean; bottom?: boolean; stretch?: boolean }>(), { bottom: false, stretch: false })
const live = useLive()
/** 눈꽃 가지 6개(가운데에서 바깥으로 + 끝의 V) */
const ARMS = [0, 60, 120, 180, 240, 300]
</script>

<template>
  <div class="group" :class="{ bottom, stretch, solo: !host }">
    <button class="nav prev" title="이전 (←)" aria-label="이전" @click="live.actions.prev()">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5.5v13L6.5 12z" fill="currentColor" /></svg>
    </button>
    <button class="nav next" title="다음 (→ / Space)" aria-label="다음" @click="live.actions.next()">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l9.5-6.5z" fill="currentColor" /></svg>
    </button>
    <button class="blank" :class="{ on: live.state.blank }" title="자막 내리기 (B)" :aria-label="live.state.blank ? 'BLANK 해제' : 'BLANK'" :aria-pressed="live.state.blank" @click="live.actions.toggleBlank()">
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
        <path d="M4 4l16 16" />
      </svg>
      <span class="lbl">BLANK<span v-if="live.state.blank" class="off-word"> 해제</span></span>
    </button>
    <button
      v-if="host"
      class="freeze"
      :class="{ on: !!live.state.frozen }"
      title="송출 화면 고정 — 조작은 계속되지만 송출은 그대로 (F 로 걸기, 해제는 이 버튼)"
      :aria-label="live.state.frozen ? 'FREEZE 해제' : 'FREEZE'"
      :aria-pressed="!!live.state.frozen"
      @click="live.state.frozen ? live.actions.unfreeze() : live.actions.freeze()"
    >
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <g v-for="a in ARMS" :key="a" :transform="`rotate(${a} 12 12)`"><path d="M12 12V2.5M9.3 4.6 12 7.2l2.7-2.6" /></g>
      </svg>
      <span class="lbl">FREEZE<span v-if="live.state.frozen" class="off-word"> 해제</span></span>
    </button>
  </div>
</template>

<style scoped>
.group { display: flex; gap: 6px; }
.group button { min-height: 34px; font-weight: 600; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.ic { width: 1.15em; height: 1.15em; flex: none; }
/* 3D: 색은 background-color 만(면 그라데이션 유지), 받침 색 --edge 는 더 어두운 같은 계열 */
.nav { min-width: 52px; font-size: 16px; background-color: #33333f; border-color: #4e4e5b; }
.nav:hover { background-color: #3d3d4a; border-color: #5e5e6c; }
/* 최소 폭: 켜면 글자가 'BLANK 해제'로 길어져 옆 버튼이 밀리면 예배 중 잘못 누르기 쉽다 → 폭 고정(아이콘 자리 포함) */
.blank, .freeze { min-width: 9.2em; }
.blank { --edge: #4d3407; color: var(--warn); border-color: rgba(245, 165, 36, .5); }
.blank:hover { background-color: #3a3222; border-color: var(--warn); }
.freeze { --edge: #0b3a50; color: var(--freeze); border-color: rgba(56, 189, 248, .5); }
.freeze:hover { background-color: #1f3340; border-color: var(--freeze); }
.blank.on, .blank.on:hover { --edge: #93600c; background-color: var(--warn); border-color: #ffc25a; color: #222; font-weight: 700; }
.freeze.on, .freeze.on:hover { --edge: #13729b; background-color: var(--freeze); border-color: #7dd6fb; color: #fff; font-weight: 700; } /* 켜짐 = 흰 아이콘·글자(사용자 요청) */
@media (max-width: 1150px) { .blank, .freeze { min-width: 0; } }

/* 리모컨 PC 화면: 버튼이 줄을 채움 */
.stretch { flex: 1; }
.stretch button { flex: 1; padding: 10px 12px; }

/* 폰: 맨 아래 한 줄, 아이콘만, 같은 폭. 제스처 막대와 겹치지 않게 아래 여백 */
.bottom {
  display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-areas: 'blank freeze prev next'; /* 같은 폭(사용자 결정 — ▶ 만 넓으면 오류처럼 보임) */
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); background: var(--panel); border-top: 1px solid var(--line);
}
.bottom.solo { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: 'blank prev next'; }
.bottom button { min-width: 0; min-height: 48px; margin-bottom: 0; padding: 0; } /* 받침(4px) 자리는 위아래 여백(8px)이 이미 충분 */
.bottom .lbl { display: none; } /* 아이콘만(켜짐은 채운 색으로) — 작은 글자는 보류(사용자 결정) */
.bottom .ic { width: 24px; height: 24px; }
.bottom .blank { grid-area: blank; }
.bottom .freeze { grid-area: freeze; }
.bottom .prev { grid-area: prev; }
.bottom .next { grid-area: next; }
</style>
