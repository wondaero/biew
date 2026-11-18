<script setup lang="ts">
/**
 * 출력 설정 미리보기 + 적용/되돌리기(src/live/styleDraft.ts).
 *  - 모바일: 출력 설정 시트 위쪽에 고정(항상 보임).
 *  - PC: 출력 설정 팝업(StyleDialog) 왼쪽에 크게.
 *  - compact: 적용 안 된 변경이 있을 때만 화면, 적용 직후엔 '이전 설정으로' 버튼만(지금은 안 씀 — 좁은 자리에 붙일 때용).
 * 설정을 바꾸면 수정본만 바뀌고 송출은 그대로 → 이 화면 = '적용하면 이렇게 나간다'. 수정본이 없으면 = 지금 송출 모습.
 * 송출 중인 글이 없으면(BLANK·콘티 없음) 컨트롤러가 가리키는 슬라이드, 그것도 없으면 견본 글로 보여 준다.
 */
import { computed } from 'vue'
import { useLive } from '@/live/liveStore'
import { useStyleDraft } from '@/live/styleDraft'
import { onAir, currentText } from '@/live/nav'
import SlideRender from '@/components/SlideRender.vue'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const live = useLive()
const s = live.state
const draft = useStyleDraft()
/** 견본 글(가사 아님) — 줄 길이·글자 모양을 볼 수 있게 한글·영문 섞어서 */
const SAMPLE = '가나다라 마바사 아자차\nLorem ipsum dolor sit\n카타파하 미리보기 글'

const text = computed(() => {
  const air = onAir(s)
  if (air.text && !air.blank) return { text: air.text, note: '' }
  const cur = currentText(s)
  if (cur) return { text: cur, note: air.blank ? ' (BLANK 중 — 현재 위치 글)' : ' (현재 위치 글)' }
  return { text: SAMPLE, note: ' (견본 글)' }
})
const label = computed(() => (draft.dirty.value ? '적용 전 미리보기 — 송출엔 아직 안 나감' : '송출 화면'))
</script>

<template>
  <div class="style-pv" :class="{ dirty: draft.dirty.value, compact }">
    <div v-if="!compact || draft.dirty.value" class="pv-bar">{{ label }}<small>{{ text.note }}</small></div>
    <div v-if="!compact || draft.dirty.value" class="pv-screen">
      <SlideRender :text="text.text" :style-cfg="draft.shown.value" :animate="false" />
    </div>
    <div v-if="draft.dirty.value" class="pv-actions">
      <button title="수정본을 버리고 지금 송출 중인 설정으로" @click="draft.revert()">되돌리기</button>
      <button class="apply" title="수정본을 송출(프로젝터)에 반영" @click="draft.apply()">적용 — 송출에 반영</button>
    </div>
    <div v-else-if="draft.canUndo.value" class="pv-actions">
      <button class="undo" title="방금 적용한 것을 취소하고 그 전 설정으로(바로 송출)" @click="draft.undo()">↶ 방금 적용 취소 (이전 설정으로)</button>
    </div>
  </div>
</template>

<style scoped>
.style-pv { display: grid; gap: 6px; }
.pv-bar { font-size: 11px; color: var(--live); font-weight: 600; }
.style-pv.dirty .pv-bar { color: var(--preview); }
.pv-bar small { color: var(--muted); font-weight: normal; }
/* 16:9, 시트 높이를 다 먹지 않게 화면 높이의 26% 이내 */
.pv-screen { aspect-ratio: 16 / 9; width: min(100%, calc(26dvh * 16 / 9)); margin: 0 auto; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
/* 수정본 = 미리보기 색(파랑 점선) — 송출 화면(초록)과 구분 */
.style-pv.dirty .pv-screen { border: 2px dashed var(--preview-soft); }
/* PC(compact): 위에 송출 모니터가 따로 있으므로 미리보기는 작게 — 설정 영역을 덜 가리게 */
.style-pv.compact .pv-screen { width: min(100%, 260px); }
.pv-actions { display: flex; gap: 6px; }
.pv-actions button { flex: 1; padding: 7px 8px; font-size: 13px; }
/* 적용 = 송출에 나감 → 송출 색(초록), TAKE 와 같은 규칙 */
.apply { flex: 2; --edge: #12803b; background-color: var(--live); border-color: #4be080; color: var(--live-ink); font-weight: 700; }
.apply:hover { background-color: #34d36b; border-color: #5fe891; }
.undo { font-size: 12px; color: var(--muted); }
</style>
