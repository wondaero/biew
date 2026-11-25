<script setup lang="ts">
/**
 * 곡 추가/수정/삭제. 빈 줄 = 슬라이드 구분.
 * 오른쪽에 현재 출력 스타일 그대로 슬라이드 미리보기.
 * 저장·삭제는 언제나 이 기기에만(인터넷·로그인 불필요) — DB 에는 곡 목록의 [⬆ 업로드]로 올린다(2026-11-19 사용자 결정).
 */
import OnAirStrip from './OnAirStrip.vue'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Song } from '@shared/types'
import { textToSlides, slidesToText, slideRanges, slideIndexAt } from '@shared/slidesText'
import { saveSong, deleteSong, useLibrary, isLocalNewId } from '@/library/library'
import { findDuplicates } from '@shared/songCompare'
import { useLive } from '@/live/liveStore'
import SlideRender from '@/components/SlideRender.vue'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import { canAutoFocus } from '@/lib/device'

/** initialSlides: 처음 보여 줄 슬라이드(오늘 선곡에서 고친 내용 — 슬라이드 목록 곡 제목 줄 [편집]). 비교 기준(base)은 song(원본) 그대로 */
const props = defineProps<{ song: Song | null; initialSlides?: string[] }>() // song null = 새 곡
const emit = defineEmits<{ close: []; saved: [song: Song] }>()

const live = useLive()
const lib = useLibrary()
/** 이 곡이 PC 에만 있는 변경인지(아직 서버에 안 올라감) */
const localKind = computed(() => (props.song ? lib.localKind.value.get(props.song.id) : undefined))

/** 새 곡이 이미 있는 곡과 겹치는지(시스템 비교 ===). 겹치면 안내 문구, 아니면 null */
function duplicateWarning(): string | null {
  const d = findDuplicates({ title: title.value, slides: slides.value }, lib.songs.value)
  const names = (list: Song[]) => list.slice(0, 3).map((s) => `"${s.title}"`).join(', ')
  const lines: string[] = []
  if (d.sameLyrics.length) lines.push(`가사가 같은 곡: ${names(d.sameLyrics)}`)
  if (d.sameTitle.length) lines.push(`제목이 같은 곡: ${names(d.sameTitle)}`)
  return lines.length ? lines.join('\n') : null
}
const title = ref(props.song?.title ?? '')
const text = ref(props.initialSlides ? slidesToText(props.initialSlides) : props.song ? slidesToText(props.song.slides) : '')
const initial = { title: title.value, text: text.value }
const slides = computed(() => textToSlides(text.value))
const dirty = computed(() => title.value !== initial.title || text.value !== initial.text)
const busy = ref(false)
// 뒤로가기 = 닫기(저장 안 한 변경이 있으면 확인 — 취소하면 그대로 열려 있음)
useBackClose(() => true, () => close())
const err = ref<string | null>(null)
const titleInput = ref<HTMLInputElement>()
const isNew = !props.song

// 커서 위치 ↔ 미리보기 연결
const ta = ref<HTMLTextAreaElement>()
const preview = ref<HTMLElement>()
const caret = ref(0)
const ranges = computed(() => slideRanges(text.value))
const activeSlide = computed(() => slideIndexAt(ranges.value, caret.value))
function syncCaret() { caret.value = ta.value?.selectionStart ?? 0 }
watch(activeSlide, async (i) => {
  await nextTick()
  preview.value?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })
})

/** 미리보기 클릭 → 입력칸에서 그 슬라이드 선택 + 화면 안으로 스크롤 */
function jumpTo(i: number) {
  const r = ranges.value[i], el = ta.value
  if (!r || !el) return
  el.focus()
  el.setSelectionRange(r.start, r.end)
  const lineH = parseFloat(getComputedStyle(el).lineHeight) || 24
  const line = text.value.slice(0, r.start).split('\n').length - 1
  el.scrollTop = Math.max(0, line * lineH - el.clientHeight / 3)
  caret.value = r.start
}

async function save() {
  if (busy.value) return
  busy.value = true
  err.value = null
  try {
    const dup = isNew ? duplicateWarning() : null
    if (dup && !confirm(`이미 있는 곡과 겹칩니다.\n${dup}\n\n그래도 새 곡으로 저장할까요?`)) return
    // base = 편집기를 열 때 본 서버 버전(그 사이 다른 기기가 고쳤으면 덮어쓰지 않게). PC 에만 있는 변경이면 saveSong 이 그쪽 base 를 씀
    const s = props.song
    const base = s && !localKind.value ? { updated_at: s.updated_at, title: s.title, slides: [...s.slides] } : undefined
    const r = await saveSong({ id: s?.id, title: title.value, slides: slides.value, base })
    emit('saved', r.song)
    emit('close')
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!props.song) return
  if (isLocalNewId(props.song.id)) {
    if (!confirm(`이 기기에만 있는 새 곡 "${props.song.title}"을(를) 지울까요?`)) return
  } else if (!confirm(`"${props.song.title}"을(를) 이 기기에서 삭제할까요?\nDB 에서도 지우려면 [⬆ 업로드]에서 올리세요. 이미 선곡에 들어간 곡은 이번 예배 동안 그대로 남습니다.`)) return
  busy.value = true
  try {
    await deleteSong(props.song.id)
    emit('close')
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function close() {
  if (dirty.value && !confirm('저장하지 않은 변경 사항이 있습니다. 닫을까요?')) return
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save() }
  else if (e.key === 'Escape') { e.preventDefault(); close() }
}

usePauseHotkeys()
onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (canAutoFocus()) nextTick(() => titleInput.value?.focus())
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="backdrop" @mousedown.self="close">
    <div class="dialog m-full" role="dialog" aria-modal="true">
      <!-- 머리 두 줄(사용자 결정 2026-11-19): 위 = 제목 + ✕, 아래 = 원본 파일·PC 저장 상태(길면 …) -->
      <header class="two">
        <div class="row">
          <h2>{{ isNew ? '새 곡' : '곡 수정' }}</h2>
          <span class="spacer" />
          <button class="x" title="닫기 (Esc)" @click="close">✕</button>
        </div>
        <small v-if="song?.source_file" class="src">원본: {{ song.source_file }}</small>
        <small v-if="localKind" class="local">PC 에서 {{ localKind === 'new' ? '등록한' : '고친' }} 곡 — 아직 서버에 안 올라감</small>
      </header>
      <OnAirStrip />

      <div class="body">
        <section class="edit">
          <label>
            <span>제목</span>
            <input ref="titleInput" v-model="title" placeholder="예: 001 곡 제목" />
          </label>
          <label class="grow">
            <span>가사 <small>빈 줄로 슬라이드를 나눕니다 · <span class="desk-word">오른쪽</span><span class="mob-word">아래</span> 미리보기를 누르면 해당 위치로 이동</small></span>
            <textarea
              ref="ta"
              v-model="text"
              spellcheck="false"
              :placeholder="'첫 번째 슬라이드 첫 줄\n첫 번째 슬라이드 둘째 줄\n\n두 번째 슬라이드'"
              @input="syncCaret"
              @click="syncCaret"
              @keyup="syncCaret"
              @select="syncCaret"
            />
          </label>
        </section>

        <section class="preview">
          <h3>미리보기 <small>{{ slides.length }}장</small></h3>
          <div ref="preview" class="thumbs">
            <div v-for="(s, i) in slides" :key="i" class="thumb" :data-i="i" :class="{ active: i === activeSlide }" title="클릭하면 입력칸의 이 슬라이드로 이동" @click="jumpTo(i)">
              <span class="no">{{ i + 1 }}</span>
              <SlideRender :text="s" :style-cfg="live.state.style" :animate="false" />
            </div>
            <p v-if="!slides.length" class="empty">가사를 입력하면 슬라이드가 여기에 보입니다.</p>
          </div>
        </section>
      </div>

      <footer>
        <button v-if="!isNew" class="del" :disabled="busy" @click="remove">삭제</button>
        <p v-if="err" class="err">{{ err }}</p>
        <span class="spacer" />
        <button :disabled="busy" @click="close">취소</button>
        <button class="primary" :disabled="busy || !title.trim() || !slides.length" @click="save">
          {{ busy ? '저장 중…' : '저장' }}<span v-if="!busy" class="desk-word"> (⌘/Ctrl+S)</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0, 0, 0, .6); display: grid; place-items: center; }
.dialog {
  width: calc(100vw - 32px); height: calc(100vh - 32px); display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
}
header, footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
header { border-bottom: 1px solid var(--line); }
header.two { flex-direction: column; align-items: stretch; gap: 2px; flex-wrap: nowrap !important; } /* 폰 규칙의 wrap 이면 머리 폭이 긴 파일 이름에 맞춰 늘어나 ✕ 가 화면 밖으로 밀림(겪음) */
header.two .row { display: flex; align-items: center; gap: 10px; }
header.two small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font-size: 12px; }
footer { border-top: 1px solid var(--line); }
h2 { margin: 0; font-size: 16px; }
.src { color: var(--muted); }
.local { color: var(--warn); }
.spacer { flex: 1; }
.x { border: none; background: none; box-shadow: none; margin: 0; }
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
.edit { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; min-height: 0; border-right: 1px solid var(--line); }
label { display: flex; flex-direction: column; gap: 4px; color: var(--muted); font-size: 12px; }
label small { margin-left: 6px; }
label.grow { flex: 1; min-height: 0; }
label.grow textarea { flex: 1; }
input { font-size: 15px; color: var(--text); }
textarea {
  font: 15px/1.6 system-ui, 'Malgun Gothic', sans-serif; color: var(--text); background: var(--field);
  border: 1px solid var(--field-line); border-radius: 6px; padding: 10px 12px; resize: none; min-height: 0;
}
textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.preview { display: flex; flex-direction: column; min-height: 0; padding: 14px 16px; }
.preview h3 { margin: 0 0 10px; font-size: 13px; }
.preview h3 small { color: var(--muted); font-weight: normal; margin-left: 4px; }
.thumbs { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; align-content: start; }
.thumb { position: relative; aspect-ratio: 16 / 9; border: 2px solid var(--line); border-radius: 6px; overflow: hidden; cursor: pointer; }
.thumb:hover { border-color: #5a5a68; }
.thumb.active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(79, 140, 255, .35); }
.thumb .no { position: absolute; top: 4px; left: 6px; z-index: 1; font-size: 11px; color: #bbb; text-shadow: 0 0 3px #000; }
.empty { color: var(--muted); font-size: 13px; }
.del { color: var(--pgm); border-color: #5a2a2a; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.mob-word { display: none; }

/* 폰(≤768px, 접는 폰 280px 포함): 전체 화면 · 위 가사 입력(가득) · 아래 미리보기 가로 한 줄.
   예전엔 좌우 2단이라 280px 에서 가사 칸이 한 줄에 서너 글자였음 */
@media (max-width: 768px) {
  header, footer { padding: 10px 12px; flex-wrap: wrap; }
  .body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .edit { border-right: 0; padding: 10px 12px; }
  .preview { padding: 8px 12px 10px; border-top: 1px solid var(--line); }
  .preview h3 { margin-bottom: 6px; }
  .thumbs { flex: none; display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden; }
  .thumb { flex: none; width: 150px; }
  .desk-word { display: none; }
  .mob-word { display: inline; }
}
</style>
