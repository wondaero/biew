<script setup lang="ts">
/**
 * 슬라이드 한 장 고치기(선곡 카드의 ✎, 사용자 결정 2026-11-18). 예배 중 오타를 바로 고치는 용도.
 *  - 고치는 동안 송출은 그대로. [저장]을 누르면 선곡이 바뀌고, 송출 중인 장이면 바로 새 글이 나간다(FREEZE 중이면 풀 때).
 *  - 오늘 선곡에만(임시, 2026-11-25 사용자 결정) — 곡 원본은 슬라이드 목록의 곡 제목 줄 [저장]으로(src/control/setlistChanges.ts).
 *  - 같은 글이 여러 장(후렴 반복)이면 '같은 글 N장 모두'(기본 켜짐).
 *  - 빈 줄 = 그 자리에서 장 나누기(2026-11-19 — 현장에서 한 장을 둘로 쪼개기·뒤에 장 추가). 나뉜 장마다 미리보기.
 *    송출·미리보기 위치는 같은 글을 가리키도록 liveStore.editSlides 가 옮긴다.
 *  - [삭제](2026-11-22 사용자 요청): 그 장(같은 글 모두가 켜져 있으면 그 N장)을 지운다 — 확인창에 몇 장인지. 오늘 선곡만.
 *    송출 중인 장이면 BLANK. 곡의 마지막 한 장은 못 지운다(곡을 빼려면 선곡에서).
 *  - Ctrl/⌘+Enter 저장 · Esc 닫기. 열린 동안 송출 단축키 막음, 뒤로가기 = 닫기.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir } from '@/live/nav'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import { parseSlideEdit, sameTextIndexes } from './slideEdit'
import SlideRender from '@/components/SlideRender.vue'
import OnAirStrip from './OnAirStrip.vue'
import { canAutoFocus } from '@/lib/device'

const props = defineProps<{ itemKey: string; slideIndex: number }>()
const emit = defineEmits<{ close: []; save: [p: { pieces: string[]; indexes: number[] }] }>()
const live = useLive()

const item = computed(() => live.state.setlist.find((x) => x.key === props.itemKey))
const original = item.value?.slides[props.slideIndex] ?? ''
const text = ref(original)
const sameAll = ref(true)
const box = ref<HTMLTextAreaElement>()

/** 고친 글 → 장들(빈 줄 = 나누기) */
const pieces = computed(() => parseSlideEdit(text.value))
const error = computed(() => (pieces.value ? '' : '글을 입력하세요'))
const changed = computed(() => !!pieces.value && (pieces.value.length > 1 || pieces.value[0] !== original))
const same = computed(() => (item.value ? sameTextIndexes(item.value.slides, original) : []))
const itemIndex = computed(() => live.state.setlist.findIndex((x) => x.key === props.itemKey))
const onAirNote = computed(() => {
  const a = onAir(live.state)
  const hit = (j: number) => a.itemIndex === itemIndex.value && a.slideIndex === j
  const targets = sameAll.value ? same.value : [props.slideIndex]
  if (!targets.some(hit)) return ''
  return a.frozen ? 'FREEZE 중 — 저장해도 송출은 그대로, FREEZE 를 풀면 새 글이 나갑니다' : '송출 중인 장 — 저장하면 바로 바뀝니다'
})

/** 지울 장 = 이 장 하나(같은 글 모두 체크는 고치기에만 — 삭제까지 묶으면 후렴이 통째로 지워짐, 2026-11-25 사용자 지적) */
const delTargets = computed(() => [props.slideIndex])
/** FREEZE 중인 장은 못 지운다(송출은 고정 글인데 목록의 '송출 중' 표시가 옆 장으로 옮겨 가 헷갈림 — liveStore.editSlides) */
const frozenHit = computed(() => live.state.frozen?.itemIndex === itemIndex.value && delTargets.value.includes(live.state.frozen.slideIndex))
const canDelete = computed(() => !!item.value && item.value.slides.length > delTargets.value.length && !frozenHit.value)
const deleteTitle = computed(() => (frozenHit.value ? 'FREEZE 중인 장은 지울 수 없습니다 — FREEZE 를 풀고 지우세요'
  : canDelete.value ? '이 장 지우기' : '곡의 마지막 장은 지울 수 없습니다 — 곡을 빼려면 선곡에서'))
function remove() {
  if (!canDelete.value || !item.value) return
  const n = delTargets.value.length
  // 컨트롤러가 가리키는 장을 지우면 BLANK(liveStore.editSlides). FREEZE 중이면 송출은 고정 화면 그대로 — 풀 때 BLANK
  const ctlHit = live.state.itemIndex === itemIndex.value && delTargets.value.includes(live.state.slideIndex)
  void n
  const msg = `${props.slideIndex + 1}장을 지울까요?`
    + '\n오늘 선곡에서만 지웁니다(곡 원본은 곡 제목 줄 [저장]으로).'
    + (changed.value ? '\n위에서 고친 글은 버려집니다.' : '')
    + (ctlHit ? (live.state.frozen ? '\n\n지금 가리키는 장입니다 — FREEZE 를 풀면 BLANK 가 됩니다.' : '\n\n송출 중인 장입니다 — 지우면 BLANK 가 됩니다.') : '')
  if (!confirm(msg)) return
  emit('save', { pieces: [], indexes: delTargets.value })
}
function save() {
  if (!changed.value || !item.value) return
  emit('save', { pieces: pieces.value!, indexes: sameAll.value ? same.value : [props.slideIndex] })
}
function close() {
  if (changed.value && !confirm('고친 내용을 버리고 닫을까요?')) return false
  emit('close')
  return true
}

usePauseHotkeys()
useBackClose(() => true, () => { close() })
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (canAutoFocus()) void nextTick(() => { box.value?.focus(); box.value?.setSelectionRange(0, 0) })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="se-backdrop" @mousedown.self="close()">
    <div class="se m-full" role="dialog" aria-modal="true" aria-label="슬라이드 수정">
      <header>
        <div class="row">
          <h2>슬라이드 수정</h2>
          <button class="x" title="닫기 (Esc)" @click="close()">✕</button>
        </div>
        <small class="where">{{ item?.title }} · {{ slideIndex + 1 }}장</small>
      </header>
      <OnAirStrip />
      <div class="body">
        <textarea ref="box" v-model="text" class="txt" rows="5" spellcheck="false" aria-label="슬라이드 글" />
        <p v-if="error" class="err">{{ error }}</p>
        <p class="hint">빈 줄을 넣으면 그 자리에서 장이 나뉩니다(뒤에 새 장 추가도 같은 방법).</p>
        <p v-if="pieces && pieces.length > 1" class="split">✂ {{ pieces.length }}장으로 나뉩니다{{ sameAll && same.length > 1 ? ` — 같은 글 ${same.length}곳 모두` : '' }}</p>
        <div class="pvs" :class="{ many: pieces && pieces.length > 1 }">
          <div v-for="(p, k) in pieces ?? [text]" :key="k" class="pv">
            <span v-if="pieces && pieces.length > 1" class="no">{{ k + 1 }}</span>
            <SlideRender :text="p" :style-cfg="live.state.style" :animate="false" />
          </div>
        </div>
        <label v-if="same.length > 1" class="chk"><input v-model="sameAll" type="checkbox" /> 이 곡에서 같은 글 {{ same.length }}장 모두 고치기</label>
        <p class="hint">오늘 선곡에만 바뀝니다. 곡 원본에 남기려면 슬라이드 목록의 곡 제목 줄 <b>[저장]</b>.</p>
        <p v-if="onAirNote" class="air">{{ onAirNote }}</p>
      </div>
      <footer>
        <button class="danger-line del" :disabled="!canDelete" :title="deleteTitle" @click="remove">이 장 삭제</button>
        <small class="keys">Ctrl+Enter 저장 · Esc 닫기</small>
        <button @click="close()">취소</button>
        <button class="primary" :disabled="!changed" @click="save">저장</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.se-backdrop { position: fixed; inset: 0; z-index: 46; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.se {
  width: min(560px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}
/* 머리 두 줄: 위 = 제목 + ✕, 아래 = 곡·장 */
header { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
header .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
h2 { margin: 0; font-size: 16px; white-space: nowrap; }
.where { min-width: 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { border: none; background: none; box-shadow: none; margin: 0; padding: 2px 8px; color: var(--muted); }
.body { flex: 1; display: grid; gap: 10px; align-content: start; padding: 12px 14px; overflow-y: auto; min-height: 0; }
.txt { width: 100%; box-sizing: border-box; font-size: 16px; line-height: 1.5; resize: vertical; white-space: pre; overflow-x: auto; }
.err { margin: 0; color: var(--danger, #ff6b6b); font-size: 12px; }
.hint { margin: 0; color: var(--muted); font-size: 12px; }
.split { margin: 0; color: var(--accent); font-size: 13px; font-weight: 600; }
.pvs { display: grid; gap: 8px; }
.pvs.many { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.pv { position: relative; aspect-ratio: 16 / 9; width: 100%; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.pvs.many .pv { border-color: var(--preview-soft); border-style: dashed; }
.pv .no { position: absolute; top: 3px; left: 5px; z-index: 1; font-size: 11px; color: #bbb; text-shadow: 0 0 3px #000; }
.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.chk small { color: var(--muted); }
.air { margin: 0; font-size: 12px; color: var(--live); font-weight: 600; }
footer { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }
.keys { flex: 1; color: var(--muted); font-size: 12px; }
footer button { min-width: 72px; }
@media (max-width: 768px) {
  .keys { display: none; }
  footer { justify-content: flex-end; }
  footer button { flex: 1; min-width: 0; }
}
</style>
