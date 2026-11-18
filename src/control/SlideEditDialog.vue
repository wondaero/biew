<script setup lang="ts">
/**
 * 슬라이드 한 장 고치기(콘티 카드의 ✎, 사용자 결정 2026-11-18). 예배 중 오타를 바로 고치는 용도.
 *  - 고치는 동안 송출은 그대로. [저장]을 누르면 콘티가 바뀌고, 송출 중인 장이면 바로 새 글이 나간다(FREEZE 중이면 풀 때).
 *  - '곡 원본에도 저장'(기본 켜짐): 원본의 그 글만 바꿔 곡 저장 규칙대로(온라인+로그인 = 서버, 아니면 PC). 실제 저장은 부모(SlideGrid).
 *  - 같은 글이 여러 장(후렴 반복)이면 '같은 글 N장 모두'(기본 켜짐).
 *  - 빈 줄 금지(슬라이드 나누기는 곡 편집기). Ctrl/⌘+Enter 저장 · Esc 닫기. 열린 동안 송출 단축키 막음, 뒤로가기 = 닫기.
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir } from '@/live/nav'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import { cleanSlideText, sameTextIndexes } from './slideEdit'
import SlideRender from '@/components/SlideRender.vue'

const props = defineProps<{ itemKey: string; slideIndex: number }>()
const emit = defineEmits<{ close: []; save: [p: { text: string; indexes: number[]; toSong: boolean; all: boolean }] }>()
const live = useLive()

const item = computed(() => live.state.setlist.find((x) => x.key === props.itemKey))
const original = item.value?.slides[props.slideIndex] ?? ''
const text = ref(original)
const sameAll = ref(true)
const toSong = ref(true)
const box = ref<HTMLTextAreaElement>()

const cleaned = computed(() => cleanSlideText(text.value))
const error = computed(() => (!text.value.trim() ? '글을 입력하세요' : cleaned.value == null ? '빈 줄은 쓸 수 없습니다 — 슬라이드 나누기는 곡 편집기에서' : ''))
const changed = computed(() => cleaned.value != null && cleaned.value !== original)
const same = computed(() => (item.value ? sameTextIndexes(item.value.slides, original) : []))
const itemIndex = computed(() => live.state.setlist.findIndex((x) => x.key === props.itemKey))
const onAirNote = computed(() => {
  const a = onAir(live.state)
  const hit = (j: number) => a.itemIndex === itemIndex.value && a.slideIndex === j
  const targets = sameAll.value ? same.value : [props.slideIndex]
  if (!targets.some(hit)) return ''
  return a.frozen ? 'FREEZE 중 — 저장해도 송출은 그대로, FREEZE 를 풀면 새 글이 나갑니다' : '송출 중인 장 — 저장하면 바로 바뀝니다'
})

function save() {
  if (!changed.value || !item.value) return
  emit('save', { text: cleaned.value!, indexes: sameAll.value ? same.value : [props.slideIndex], toSong: toSong.value, all: sameAll.value })
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
  void nextTick(() => { box.value?.focus(); box.value?.setSelectionRange(0, 0) })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="se-backdrop" @mousedown.self="close()">
    <div class="se" role="dialog" aria-modal="true" aria-label="슬라이드 수정">
      <header>
        <h2>슬라이드 수정</h2>
        <small class="where">{{ item?.title }} · {{ slideIndex + 1 }}장</small>
        <button class="x" title="닫기 (Esc)" @click="close()">✕</button>
      </header>
      <div class="body">
        <textarea ref="box" v-model="text" class="txt" rows="5" spellcheck="false" aria-label="슬라이드 글" />
        <p v-if="error" class="err">{{ error }}</p>
        <div class="pv"><SlideRender :text="cleaned ?? text" :style-cfg="live.state.style" :animate="false" /></div>
        <label v-if="same.length > 1" class="chk"><input v-model="sameAll" type="checkbox" /> 이 곡에서 같은 글 {{ same.length }}장 모두 고치기</label>
        <label class="chk"><input v-model="toSong" type="checkbox" /> 곡 원본에도 저장 <small>(끄면 오늘 콘티만)</small></label>
        <p v-if="onAirNote" class="air">{{ onAirNote }}</p>
      </div>
      <footer>
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
header { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 16px; white-space: nowrap; }
.where { flex: 1; min-width: 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { border: none; background: none; box-shadow: none; margin: 0; padding: 2px 8px; color: var(--muted); }
.body { display: grid; gap: 10px; padding: 12px 14px; overflow-y: auto; min-height: 0; }
.txt { width: 100%; box-sizing: border-box; font-size: 16px; line-height: 1.5; resize: vertical; white-space: pre; overflow-x: auto; }
.err { margin: 0; color: var(--danger, #ff6b6b); font-size: 12px; }
.pv { aspect-ratio: 16 / 9; width: 100%; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.chk small { color: var(--muted); }
.air { margin: 0; font-size: 12px; color: var(--live); font-weight: 600; }
footer { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }
.keys { flex: 1; color: var(--muted); font-size: 12px; }
footer button { min-width: 72px; }
@media (max-width: 768px) {
  .se-backdrop { place-items: end stretch; }
  .se { width: auto; max-height: 92dvh; border-radius: 14px 14px 0 0; border-bottom: 0; padding-bottom: env(safe-area-inset-bottom); }
  .keys { display: none; }
  footer { justify-content: flex-end; }
  footer button { flex: 1; min-width: 0; }
}
</style>
