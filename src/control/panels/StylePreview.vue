<script setup lang="ts">
/**
 * 출력 설정 미리보기 + 적용/되돌리기(src/live/styleDraft.ts).
 *  - 모바일: 출력 설정 시트 위쪽에 고정(항상 보임).
 *  - PC: 출력 설정 팝업(StyleDialog) 왼쪽에 크게.
 *  - compact: 적용 안 된 변경이 있을 때만 화면, 적용 직후엔 '이전 설정으로' 버튼만(지금은 안 씀 — 좁은 자리에 붙일 때용).
 * 설정을 바꾸면 수정본만 바뀌고 송출은 그대로 → 이 화면 = '적용하면 이렇게 나간다'. 수정본이 없으면 = 지금 송출 모습.
 * 비교 전환(toggle, 모바일 시트): 고친 내용이 있으면 위에 [적용 전 | 송출 중] — 같은 자리·같은 크기로 바꿔 보며 비교
 *   (시트가 뒤의 송출 화면을 가리고, 둘을 나란히 두면 폰에서 글자를 못 읽을 만큼 작아져서). PC 팝업은 둘을 함께 보여 주므로 끈다.
 * 송출 중인 글이 없으면(BLANK·선곡 없음) 컨트롤러가 가리키는 슬라이드, 그것도 없으면 견본 글로 보여 준다.
 */
import { ref, computed, watch } from 'vue'
import { useLive } from '@/live/liveStore'
import { useStyleDraft } from '@/live/styleDraft'
import { onAir, currentText } from '@/live/nav'
import SlideRender from '@/components/SlideRender.vue'

/** actions=false: 버튼 없이 미리보기만(PC 팝업 — 버튼은 오른쪽 설정 아래에). toggle=false: 비교 전환 없음(PC 팝업) */
const props = withDefaults(defineProps<{ compact?: boolean; actions?: boolean; toggle?: boolean }>(), { compact: false, actions: true, toggle: true })
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
/** 비교 전환: draft = 적용 전(수정본), air = 지금 송출 중. 고친 내용이 없어지면 다시 적용 전으로 */
const view = ref<'draft' | 'air'>('draft')
watch(() => draft.dirty.value, (d) => { if (!d) view.value = 'draft' })
const showAir = computed(() => props.toggle && draft.dirty.value && view.value === 'air')
const styleCfg = computed(() => (showAir.value ? s.style : draft.shown.value))
const label = computed(() => (showAir.value ? (draft.instant.value ? '저장된 설정 — 저장 안 하면 이걸로 돌아감' : '지금 송출 중')
  : draft.dirty.value ? (draft.instant.value ? '송출 화면에 보이는 중 — [저장]해야 유지' : '저장 전 미리보기 — 송출엔 아직 안 나감') : '송출 화면'))
</script>

<template>
  <div class="style-pv" :class="{ dirty: draft.dirty.value && !showAir, inst: draft.instant.value, air: showAir, compact }">
    <div v-if="toggle && draft.dirty.value" class="pv-tabs" role="tablist" aria-label="비교">
      <button role="tab" :aria-selected="view === 'draft'" :class="{ on: view === 'draft' }" @click="view = 'draft'">저장 전</button>
      <button role="tab" :aria-selected="view === 'air'" :class="{ on: view === 'air' }" @click="view = 'air'">{{ draft.instant.value ? '저장된 설정' : '송출 중' }}</button>
    </div>
    <div v-if="!compact || draft.dirty.value" class="pv-bar">{{ label }}<small>{{ text.note }}</small></div>
    <div v-if="!compact || draft.dirty.value" class="pv-screen">
      <SlideRender :text="text.text" :style-cfg="styleCfg" :animate="false" />
    </div>
    <div v-if="actions && draft.dirty.value" class="pv-actions">
      <button title="고친 것을 버리고 저장된 설정으로" @click="draft.revert()">되돌리기</button>
      <button class="apply" title="이 설정으로 송출 확정" @click="draft.apply()">저장</button>
    </div>
    <div v-else-if="actions && draft.canUndo.value" class="pv-actions">
      <button class="undo" title="방금 저장한 것을 취소하고 그 전 설정으로(바로 송출)" @click="draft.undo()">↶ 방금 저장 취소 (이전 설정으로)</button>
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
/* 바로 적용: 저장 전이지만 실제로 송출 화면에 보이는 중 → 송출 색(초록 점선 — 저장 전이라 점선) */
.style-pv.dirty.inst .pv-bar { color: var(--live); }
.style-pv.dirty.inst .pv-screen { border-color: var(--live); }
/* PC(compact): 위에 송출 모니터가 따로 있으므로 미리보기는 작게 — 설정 영역을 덜 가리게 */
.style-pv.compact .pv-screen { width: min(100%, 260px); }
/* 비교 전환: 고른 쪽은 눌린 모양(세그먼트 규칙) — 적용 전 = 파랑, 송출 중 = 초록 */
.pv-tabs { display: flex; gap: 4px; }
.pv-tabs button { flex: 1; margin-bottom: 0; font-size: 14px; }
.pv-tabs button.on { background: rgba(79, 140, 255, .2); border-color: var(--accent); color: #dbe7ff; font-weight: 600; box-shadow: inset 0 2px 4px rgba(0, 0, 0, .45); }
.style-pv.air .pv-tabs button.on { background: var(--live-bg); border-color: var(--live); color: #c9f5d9; }
.style-pv.air .pv-screen { border: 2px solid var(--live); }
.pv-actions { display: flex; gap: 6px; }
.pv-actions button { flex: 1; padding: 7px 8px; font-size: 13px; }
/* 적용 = 송출에 나감 → 송출 색(초록), TAKE 와 같은 규칙 */
.apply { flex: 2; --edge: #12803b; background-color: var(--live); border-color: #4be080; color: var(--live-ink); font-weight: 700; }
.apply:hover { background-color: #34d36b; border-color: #5fe891; }
.undo { font-size: 12px; color: var(--muted); }
</style>
