<script setup lang="ts">
/**
 * FREEZE 켜짐 표시 — 버튼 안에서만 눈송이 몇 개가 천천히 내림(2026-11-19 사용자 결정, 눈보라처럼 많거나 빠르게 하지 말 것).
 * 목적: 색만 바뀐 버튼은 눈에 익으면 안 보이게 됨 → 작은 움직임으로 "FREEZE 걸려 있음"을 잊지 않게.
 * 송출·보기·미리보기 화면에는 절대 넣지 않는다. '동작 줄이기' 설정이면 표시 안 함.
 * 되돌리기: TransportBar.vue 의 <FreezeSnow …/> 한 줄과 import 를 지우고 이 파일을 삭제.
 */
/** 눈송이: 가로 위치(%), 크기(px), 떨어지는 시간(s), 시작 지연(s), 흔들림 방향 */
const FLAKES = [
  { x: 18, s: 3, d: 3.4, t: 0, w: 4 },
  { x: 46, s: 2.5, d: 4.2, t: 1.3, w: -3 },
  { x: 72, s: 3.5, d: 3.8, t: 2.4, w: 3 },
  { x: 88, s: 2, d: 4.6, t: 0.7, w: -4 },
]
</script>

<template>
  <span class="snow" aria-hidden="true">
    <i v-for="(f, k) in FLAKES" :key="k" :style="{ left: `${f.x}%`, width: `${f.s}px`, height: `${f.s}px`, animationDuration: `${f.d}s`, animationDelay: `${f.t}s`, '--sway': `${f.w}px` }" />
  </span>
</template>

<style scoped>
.snow { position: absolute; inset: 0; overflow: hidden; pointer-events: none; border-radius: inherit; }
.snow i {
  position: absolute; top: 0; border-radius: 50%; background: #fff; opacity: 0;
  box-shadow: 0 0 2px rgba(255, 255, 255, .8);
  animation-name: fall; animation-timing-function: linear; animation-iteration-count: infinite;
}
@keyframes fall {
  0% { transform: translate(0, -6px); opacity: 0; }
  15% { opacity: .9; }
  50% { transform: translate(var(--sway), 50cqh); }
  85% { opacity: .9; }
  100% { transform: translate(0, calc(100cqh + 6px)); opacity: 0; }
}
/* 컨테이너 높이 기준(cqh) — 버튼 높이가 PC 34px / 폰 48px 로 달라도 끝까지 내려오게 */
.snow { container-type: size; }
@media (prefers-reduced-motion: reduce) { .snow { display: none; } }
</style>
