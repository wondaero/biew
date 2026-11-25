<script setup lang="ts">
/**
 * 고친 곡을 선곡에서 빼거나 선곡을 비울 때 묻는 창(2026-11-25 사용자 결정) — [저장하고 제외] [버리고 제외] [취소].
 * 요청은 src/control/setlistChanges.ts 의 exitRequest. PC = 가운데 작은 창, 폰 = 아래 시트(입력 없이 고르기만 — 폰 팝업 규칙).
 * 뒤로가기·Esc·바깥 = 취소. 열린 동안 송출 단축키 막음.
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { exitRequest, type ExitChoice } from './setlistChanges'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'

const req = computed(() => exitRequest.value!)
const titles = computed(() => req.value.items.map((x) => x.title))
function answer(c: ExitChoice) {
  const r = exitRequest.value
  exitRequest.value = null
  r?.resolve(c)
}
usePauseHotkeys()
useBackClose(() => true, () => answer('cancel'))
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); answer('cancel') } }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="xc-backdrop" @mousedown.self="answer('cancel')">
    <div class="xc" role="alertdialog" aria-modal="true" aria-label="고친 내용 저장">
      <h2>고친 내용이 있습니다</h2>
      <p>
        <template v-if="titles.length === 1"><b>"{{ titles[0] }}"</b> 은(는)</template>
        <template v-else><b>{{ titles.length }}곡</b>({{ titles.join(', ') }})은</template>
        오늘 선곡에서 바꾼 슬라이드(순서·가사)가 곡 원본에 저장되지 않았습니다.
        {{ req.all ? '선곡을 비우기 전에 어떻게 할까요?' : '선곡에서 빼기 전에 어떻게 할까요?' }}
      </p>
      <p v-if="req.onAir && !req.all" class="air">송출 중인 곡입니다 — 빼면 자막이 내려갑니다.</p>
      <div class="acts">
        <button class="primary save" @click="answer('save')">저장하고 {{ req.all ? '비우기' : '제외' }}</button>
        <button class="danger-line discard" @click="answer('discard')">버리고 {{ req.all ? '비우기' : '제외' }}</button>
        <button class="cancel" @click="answer('cancel')">취소</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.xc-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.xc { width: min(460px, calc(100vw - 32px)); display: grid; gap: 10px; padding: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 16px 48px rgba(0, 0, 0, .6); }
h2 { margin: 0; font-size: 16px; }
p { margin: 0; font-size: 14px; line-height: 1.5; }
.air { color: var(--warn); font-size: 13px; }
.acts { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px; }
.acts button { font-size: 14px; padding: 8px 14px; }
/* 폰: 아래 시트(입력 없이 고르기만 하는 팝업), 버튼은 세로로 크게 */
@media (max-width: 768px) {
  .xc-backdrop { place-items: end stretch; }
  .xc { width: auto; border-radius: 14px 14px 0 0; border-bottom: 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  .acts { flex-direction: column; }
  .acts button { padding: 12px; font-size: 15px; }
}
</style>
