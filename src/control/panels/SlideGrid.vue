<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir } from '@/live/nav'
import { vFitLines } from '@/components/fitLines'
import { useLibrary, loadCache, saveSong } from '@/library/library'
import SlideEditDialog from '../SlideEditDialog.vue'
import { patchSongSlides } from '../slideEdit'

const live = useLive()
const root = ref<HTMLElement>()

/** 실제 송출 위치. FREEZE 중이면 고정된 화면 쪽이 '송출 중' 표시를 가진다 */
const air = computed(() => onAir(live.state))
const isLive = (i: number, j: number) => i === air.value.itemIndex && j === air.value.slideIndex
/** FREEZE 중 컨트롤러가 가리키는 위치(아직 송출 안 됨) — 미리보기와 같은 파란 점선 */
const isCtl = (i: number, j: number) =>
  air.value.frozen && i === live.state.itemIndex && j === live.state.slideIndex && !isLive(i, j)
/** 미리보기 표시는 PVW 모드에서 직접 고른 슬라이드에만 (즉시 모드에선 NEXT 모니터로 충분) */
const isPreview = (i: number, j: number) =>
  live.pvwMode.value && live.preview.value?.itemIndex === i && live.preview.value?.slideIndex === j

function onClick(i: number, j: number) {
  live.actions.pick({ itemIndex: i, slideIndex: j })
}
function onDbl(i: number, j: number) {
  // PVW 모드에서 더블클릭 = 즉시 송출
  if (live.pvwMode.value) live.actions.go({ itemIndex: i, slideIndex: j })
}

// 곡별 아코디언 (접힌 곡의 key). 접혀도 헤더에 송출 중 표시가 남는다.
const closed = ref<Set<string>>(new Set())
const isClosed = (key: string) => closed.value.has(key)
function toggle(key: string) {
  const s = new Set(closed.value)
  if (!s.delete(key)) s.add(key)
  closed.value = s
}
const allClosed = computed(() => live.state.setlist.length > 0 && live.state.setlist.every((it) => closed.value.has(it.key)))
function toggleAll() {
  closed.value = allClosed.value ? new Set() : new Set(live.state.setlist.map((it) => it.key))
}

async function scrollToItem(i: number) {
  const it = live.state.setlist[i]
  if (it && closed.value.has(it.key)) toggle(it.key)
  await nextTick()
  root.value?.querySelector(`[data-item="${i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// 다른 곡으로 송출이 넘어가면 그 곡은 펼친다(송출 카드가 보여야 하므로). 같은 곡 안에서 넘길 땐 건드리지 않음
watch(
  () => live.state.itemIndex,
  (i) => {
    const it = live.state.setlist[i]
    if (it && closed.value.has(it.key)) toggle(it.key)
  },
)

// 컨트롤러 위치가 바뀌면 해당 카드가 보이도록(이미 보이면 움직이지 않음). FREEZE 중엔 고정 화면이 아니라 컨트롤러 위치를 따라간다
watch(
  () => [live.state.itemIndex, live.state.slideIndex, !!live.state.frozen],
  async () => {
    await nextTick()
    root.value?.querySelector(air.value.frozen ? '.card.ctl' : '.card.live')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  },
)

// ── 슬라이드 한 장 고치기(✎) — 콘티는 즉시, 곡 원본은 그 글만(src/control/slideEdit.ts) ──
const lib = useLibrary()
const editing = ref<{ key: string; j: number } | null>(null)
const notice = ref<{ text: string; warn: boolean } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function say(text: string, warn = false) {
  notice.value = { text, warn }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = null), warn ? 8000 : 4000)
}
async function saveEdit(p: { text: string; indexes: number[]; toSong: boolean; all: boolean }) {
  const e = editing.value
  const it = e && live.state.setlist.find((x) => x.key === e.key)
  if (!e || !it) return
  const oldText = it.slides[e.j]!
  live.setlist.editSlides(e.key, p.indexes, p.text)
  editing.value = null
  if (!p.toSong) return say('콘티만 고쳤습니다(곡 원본은 그대로)')
  await loadCache()
  const song = lib.byId.value.get(it.songId)
  const slides = song && patchSongSlides(song.slides, e.j, oldText, p.text, p.all)
  if (!song || !slides) return say(song ? '콘티는 고쳤지만 곡 원본은 그 사이 바뀌어 저장하지 않았습니다 — 곡 검색의 ✎ 로 확인하세요' : '콘티는 고쳤지만 곡 원본을 찾을 수 없습니다', true)
  try {
    const r = await saveSong({ id: song.id, title: song.title, slides })
    say(r.local ? '고쳤습니다 — 곡 원본은 이 PC 에 저장(나중에 서버에 올리기)' : '고쳤습니다 — 곡 원본도 저장')
  } catch (err) {
    say(`콘티는 고쳤지만 곡 원본 저장 실패: ${err instanceof Error ? err.message : err}`, true)
  }
}

/** 송출 중인 장으로(모니터를 누르면) — 접혀 있으면 펼치고 가운데로. FREEZE 중이면 고정된 화면 쪽 */
async function scrollToLive() {
  const it = live.state.setlist[air.value.itemIndex]
  if (it && closed.value.has(it.key)) toggle(it.key)
  await nextTick()
  root.value?.querySelector('.card.live')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

defineExpose({ scrollToItem, scrollToLive })
</script>

<template>
  <section ref="root" class="grid-wrap">
    <p v-if="!live.state.setlist.length" class="empty">콘티에 곡을 추가하면 슬라이드가 여기에 펼쳐집니다.</p>
    <div v-if="live.state.setlist.length > 1" class="tools">
      <button @click="toggleAll">{{ allClosed ? '전체 펼치기' : '전체 접기' }}</button>
    </div>
    <div v-for="(it, i) in live.state.setlist" :key="it.key" class="song" :data-item="i">
      <h3
        :class="{ live: i === air.itemIndex, closed: isClosed(it.key) }"
        role="button"
        :aria-expanded="!isClosed(it.key)"
        @click="toggle(it.key)"
      >
        <span class="chev">{{ isClosed(it.key) ? '▸' : '▾' }}</span>
        <span class="no">{{ i + 1 }}</span>
        <span class="name">{{ it.title }}</span>
        <small>{{ it.slides.length }}장</small>
        <span v-if="i === air.itemIndex" class="onair" :class="{ blanked: air.blank, frozen: air.frozen }">
          {{ air.frozen ? '❄ FREEZE' : air.blank ? '● BLANK' : '● 송출 중' }} {{ air.slideIndex + 1 }}/{{ it.slides.length }}
        </span>
      </h3>
      <p v-if="!isClosed(it.key) && !it.slides.length" class="noslide">슬라이드 없음</p>
      <div v-if="!isClosed(it.key)" class="cards">
        <div v-for="(s, j) in it.slides" :key="j" class="cell">
        <button
          class="card"
          :class="{ live: isLive(i, j), frozen: isLive(i, j) && air.frozen, pvw: isPreview(i, j), ctl: isCtl(i, j), blanked: isLive(i, j) && air.blank }"
          @click="onClick(i, j)"
          @dblclick="onDbl(i, j)"
        >
          <span class="idx">{{ j + 1 }}</span>
          <span v-fit-lines="s" class="txt">{{ s }}</span>
        </button>
        <button v-if="live.role.value === 'host'" class="edit" title="이 슬라이드 글 고치기" aria-label="이 슬라이드 글 고치기" @click="editing = { key: it.key, j }">✎</button>
        </div>
      </div>
    </div>
    <SlideEditDialog v-if="editing" :item-key="editing.key" :slide-index="editing.j" @close="editing = null" @save="saveEdit" />
    <p v-if="notice" class="se-notice" :class="{ warn: notice.warn }" role="status">{{ notice.text }}</p>
  </section>
</template>

<style scoped>
/* 위쪽 padding 0: sticky 헤더가 padding 아래에 붙으면 그 틈으로 스크롤되는 카드가 비쳐 보임 */
/* 아래 여백 작게(예전 40vh = 마지막 곡도 맨 위로 올리려던 것 — 짧은 마지막 곡일수록 크게 비어 보여서 뺌. 마지막 곡은 맨 끝이라 안 올라가도 다 보인다) */
.grid-wrap { overflow-y: auto; padding: 0 8px 16px; min-height: 0; }
.empty { color: var(--muted); text-align: center; margin-top: 30vh; }
.song { margin-bottom: 18px; scroll-margin-top: 4px; }
.tools { display: flex; justify-content: flex-end; padding: 6px 0; }.tools button { font-size: 14px; color: var(--muted); }
h3 {
  /* 좌우 -8px: 스크롤 영역 padding 을 뚫고 끝까지 → 옆 틈으로 카드 glow 가 비치지 않게 (글자 위치는 padding 으로 유지) */
  position: sticky; top: 0; z-index: 2; /* ✎(z-index 1)보다 위 — 스크롤하면 곡 제목 아래로 들어가게 */ margin: 0 -8px 8px; padding: 6px 16px; font-size: 14px; cursor: pointer; user-select: none;
  background: var(--bg); border-bottom: 1px solid var(--line); display: flex; align-items: baseline; gap: 8px;
}
h3.closed { margin-bottom: 0; }
h3.live { color: #fff; border-bottom-color: var(--live); }
h3 .chev { width: 10px; color: var(--muted); font-size: 11px; }
h3 .no { color: var(--muted); font-size: 12px; }
h3 .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
h3 small { color: var(--muted); font-weight: normal; font-size: 12px; white-space: nowrap; }
.onair { font-size: 11px; font-weight: 700; color: var(--live); white-space: nowrap; }
.onair.blanked { color: var(--warn); }
.onair.frozen { color: var(--freeze); }
.noslide { color: var(--muted); font-size: 12px; margin: 0 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.card {
  position: relative; display: flex; align-items: center; justify-content: center;
  /* 위 18px = 카드 번호 자리(글이 길어져도 번호와 겹치지 않게) */
  aspect-ratio: 16 / 9; padding: 18px 10px 8px; text-align: center; background: #0d0d10;
  border: 2px solid var(--line); border-radius: 8px; overflow: hidden;
  box-shadow: none; margin: 0; /* 카드는 버튼이지만 3D 받침 없음(송출 표시는 아래 .live 의 테두리 빛) */
}
.card:active { transform: none; }
.card:hover { border-color: #5a5a68; }
.card.pvw, .card.ctl { border-style: dashed; border-color: var(--preview-soft); }
.card.live { border-color: var(--live); background: var(--live-bg); box-shadow: 0 0 0 2px var(--live-glow); }
.card.live.frozen { border-color: var(--freeze); background: #0c2430; box-shadow: 0 0 0 2px rgba(56, 189, 248, .35); }
.card.live.frozen .idx { color: var(--freeze); }
.card.live .txt { color: #fff; }
.card.blanked .txt { opacity: .35; }
.cell { position: relative; min-width: 0; display: grid; }
/* ✎ = 카드 오른쪽 위 구석(카드 클릭 = 송출이므로 카드 밖 형제 버튼, 누를 자리 충분히). PC 는 마우스를 올렸을 때만 */
.edit {
  position: absolute; top: 3px; right: 3px; width: 36px; height: 32px; padding: 0; margin: 0; z-index: 1;
  font-size: 15px; line-height: 1; border-radius: 6px; background: rgba(20, 20, 26, .9); box-shadow: none; color: #cfd3dc;
}
.edit:active { transform: none; }
.edit:hover { border-color: var(--accent); color: #fff; }
@media (hover: hover) { .edit { opacity: 0; } .cell:hover .edit, .edit:focus-visible { opacity: 1; } }
.se-notice {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 47; margin: 0; max-width: calc(100vw - 32px);
  padding: 8px 14px; border-radius: 8px; background: #1d2a22; border: 1px solid var(--live); color: #c9f5d9; font-size: 13px;
}
.se-notice.warn { background: #2e2614; border-color: var(--warn); color: #ffe7a8; }
.idx { position: absolute; top: 4px; left: 6px; font-size: 11px; color: var(--muted); }
.card.live .idx { color: var(--live); font-weight: 700; }
@media (max-width: 768px) {
  .grid-wrap { padding: 0 10px 16px; } /* 아래 송출 버튼 줄은 겹쳐 뜨지 않고 자기 자리를 차지하므로 큰 여백 불필요 */
  .empty { margin-top: 24px; } /* 30vh 면 좁은 폰에서 안내 글이 아래로 밀려 잘림 */
  /* 1열 행 목록: 16:9 고정을 풀고 글자 길이에 맞춰 높이가 정해지게 */
  .cards { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .card { aspect-ratio: auto; min-height: 52px; justify-content: flex-start; gap: 12px; padding: 10px 12px; text-align: left; }
  .idx { position: static; min-width: 16px; text-align: center; font-size: 12px; }
  /* .card .txt: 아래 기본 .txt 규칙보다 뒤에 있어도 이기도록(예전엔 순서 때문에 14px 가 안 먹고 12.5px 였음) */
  .card .txt { font-size: 14px; }
  /* 폰: ✎ 항상 보임(마우스 올리기 없음) — 글이 ✎ 아래로 가지 않게 오른쪽 자리 비움 */
  .card { padding-right: 42px; gap: 8px; padding-left: 8px; }
  .edit { top: 50%; right: 8px; transform: translateY(-50%); width: 32px; height: 34px; }
  .edit:active { transform: translateY(-50%); }
  .se-notice { bottom: 80px; }
  h3 { margin: 0 -10px 8px; padding: 10px 18px; }
}
/*
 * 원래 줄바꿈 그대로(꺾지 않음) — 넘치면 v-fit-lines 가 이 요소의 글자 크기를 줄인다(출력 화면과 같은 규칙).
 * flex: 1 = 쓸 수 있는 폭을 꽉 채워야 폭을 잴 수 있다. 공백은 접고 줄바꿈만 지킨다.
 */
.txt {
  flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.35; color: #ddd; overflow: hidden;
  white-space: pre; white-space-collapse: preserve-breaks; text-wrap-mode: nowrap;
}
/* 최소 크기로도 넘치면 잘림 — 아래쪽을 흐리게 해 잘렸다는 걸 보이게(마우스를 올리면 전체) */
.txt.fit-clip { -webkit-mask-image: linear-gradient(to bottom, #000 80%, transparent); mask-image: linear-gradient(to bottom, #000 80%, transparent); }
</style>
