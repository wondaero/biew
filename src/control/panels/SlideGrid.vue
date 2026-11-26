<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useLive } from '@/live/liveStore'
import { onAir } from '@/live/nav'
import { vFitLines } from '@/components/fitLines'
import { useLibrary, loadCache } from '@/library/library'
import { isChanged, saveItemToSong, removeItemAsk } from '../setlistChanges'
import SlideEditDialog from '../SlideEditDialog.vue'
import MediaImage from '@/components/MediaImage.vue'
import { isMediaSlide, mediaIdOf } from '@shared/media'
import { VueDraggable } from 'vue-draggable-plus'
import { useBackClose, backSettled } from '@/lib/backClose'
import SongEditor from '../SongEditor.vue'
import { isMediaItem } from '@shared/media'
import type { SetlistItem, Song } from '@shared/types'

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

const isHost = computed(() => live.role.value === 'host')
/** 곡 박스 상태(2026-11-26 — 곡과 슬라이드를 박스로 묶음). 화면에 쓰는 건 on live(은은한 빛)뿐 — 나머지는 E2E·검사용 표시 */
function songState(i: number): string {
  if (i !== air.value.itemIndex) return ''
  if (air.value.frozen) return 'on frz'
  if (air.value.slideIndex < 0) return 'on idle'
  return air.value.blank ? 'on blk' : 'on live'
}
const textOf = (it: SetlistItem, j: number) => it.slides[j] ?? ''

function onClick(i: number, j: number) {
  if (Date.now() - dragEndAt < 300) return // 끌기를 막 끝낸 손이 클릭으로 송출하지 않게
  live.actions.pick({ itemIndex: i, slideIndex: j })
}

/**
 * 카드를 끌어서 장 순서 바꾸기(2026-11-25 사용자 요청) — 오늘 선곡만(곡 원본 그대로), 위치는 같은 장을 따라감(liveStore.moveSlide).
 * PC 는 누른 채 움직이면 끌기·그냥 클릭은 송출, 폰은 길게 눌러야 끌기(그냥 밀면 스크롤). 호스트만.
 * 곡마다 카드 목록(id = 곡 key + 원래 번호)을 두고 끌기 라이브러리가 그 순서를 바꾸면, 끝날 때 선곡에 반영하고 다시 만든다.
 */
interface CardRef { id: string; j: number }
const models = ref<Record<string, CardRef[]>>({})
watch(() => live.state.setlist, (list) => {
  models.value = Object.fromEntries(list.map((it) => [it.key, it.slides.map((_, j) => ({ id: `${it.key}:${j}`, j }))]))
}, { deep: true, immediate: true })
let dragEndAt = 0
function onDragStart() { menu.value = null }
function onDragEnd(key: string, e: { oldIndex?: number; newIndex?: number }) {
  dragEndAt = Date.now()
  if (e.oldIndex === undefined || e.newIndex === undefined || e.oldIndex === e.newIndex) return
  live.setlist.moveSlide(key, e.oldIndex, e.newIndex)
  say('순서를 바꿨습니다 — 오늘 선곡만(곡 원본은 곡 제목 줄 [원본에 저장]으로)')
}

/** 카드 ⋯ 메뉴(2026-11-25 사용자 요청 — 예전 ✎ 하나였던 자리, 기능이 늘어날 수 있어 메뉴로): 편집 · 복사(바로 뒤에, 오늘 선곡만) */
const menu = ref<{ key: string; j: number } | null>(null)
useBackClose(() => !!menu.value, () => { menu.value = null })
const isMenu = (key: string, j: number) => menu.value?.key === key && menu.value.j === j
function toggleMenu(key: string, j: number) { menu.value = isMenu(key, j) ? null : { key, j } }
async function menuEdit() {
  const m = menu.value
  menu.value = null
  if (!m) return
  // 메뉴의 뒤로가기 칸이 정리된 뒤에 편집 창을 연다(안 그러면 편집 창의 뒤로가기가 페이지를 나감 — backSettled)
  await nextTick()
  await backSettled()
  editing.value = { key: m.key, j: m.j }
}
function menuCopy() {
  const m = menu.value
  menu.value = null
  if (!m) return
  live.setlist.duplicateSlide(m.key, m.j)
  say('바로 뒤에 복사했습니다 — 오늘 선곡만(곡 원본은 곡 제목 줄 [원본에 저장]으로)')
}

/**
 * ⋯ → 삭제: 그 장 하나만(같은 가사 다른 장은 그대로). 오늘 선곡만(곡 원본은 [저장]으로). 송출 중 장이면 BLANK,
 * FREEZE 중인 장·곡의 마지막 장은 못 지움(liveStore.editSlides).
 */
function menuDelete() {
  const m = menu.value
  menu.value = null
  if (!m) return
  const i = live.state.setlist.findIndex((x) => x.key === m.key)
  const it = live.state.setlist[i]
  if (!it) return
  const ctlHit = live.state.itemIndex === i && live.state.slideIndex === m.j
  const msg = `${m.j + 1}장을 지울까요? (오늘 선곡만 — 같은 가사의 다른 장은 그대로)`
    + (ctlHit ? (live.state.frozen ? '\n\n지금 가리키는 장입니다 — FREEZE 를 풀면 BLANK 가 됩니다.' : '\n\n송출 중인 장입니다 — 지우면 BLANK 가 됩니다.') : '')
  if (!confirm(msg)) return
  const r = live.setlist.editSlides(m.key, [m.j], [])
  if (r === 'ok') say('1장 지웠습니다 — 오늘 선곡만(곡 원본은 곡 제목 줄 [원본에 저장]으로)')
  else say(r === 'last' ? '곡의 마지막 장은 지울 수 없습니다 — 곡을 빼려면 [선곡 제외]' : r === 'frozen' ? 'FREEZE 중인 장은 지울 수 없습니다 — FREEZE 를 풀고 지우세요' : '그 사이 선곡이 바뀌어 지우지 못했습니다', true)
}

/**
 * 곡 제목 줄(2026-11-25 사용자 요청): [편집] = 곡 편집기(오늘 고친 게 있으면 그 내용으로 열림) → 저장하면 곡 원본 + 오늘 선곡의 그 곡 함께.
 * 변경됨이면 [저장](지금 슬라이드를 곡 원본에) · [선곡 제외](고친 게 있으면 저장/버리기를 묻는다)
 */
const songEditing = ref<{ key: string; song: Song; initialSlides?: string[] } | null>(null)
async function editSong(it: SetlistItem) {
  await loadCache()
  const song = lib.byId.value.get(it.songId)
  if (!song) return say('이 기기의 곡 목록에 없는 곡이라 편집할 수 없습니다 — 곡 목록에서 받거나 찾아서 고치세요', true)
  // 오늘 고친 게 있으면 그 내용으로 열되, 비교 기준은 원본(같은 내용이라 저장이 건너뛰어지고 오늘 변경이 되돌려지는 일이 없게)
  songEditing.value = { key: it.key, song, initialSlides: isChanged(it) ? [...it.slides] : undefined }
}
const savingKey = ref<string | null>(null)
async function saveItem(it: SetlistItem) {
  savingKey.value = it.key
  const r = await saveItemToSong(it)
  savingKey.value = null
  if (!('cancelled' in r && r.cancelled)) say(r.text, !r.ok)
}
async function exclude(it: SetlistItem) {
  const r = await removeItemAsk(it)
  if (r) say(r.text, r.warn)
}
function onSongSaved(song: Song) {
  const e = songEditing.value
  if (e) live.setlist.refresh(e.key, song)
  say('곡을 저장하고 오늘 선곡에도 반영했습니다(이 기기에 저장 — DB 엔 곡 목록의 ⬆ 업로드로)')
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

// ── 슬라이드 한 장 고치기(✎) — 선곡은 즉시, 곡 원본은 그 글만(src/control/slideEdit.ts) ──
const lib = useLibrary()
const editing = ref<{ key: string; j: number } | null>(null)
const notice = ref<{ text: string; warn: boolean } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function say(text: string, warn = false) {
  notice.value = { text, warn }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = null), warn ? 8000 : 4000)
}
/** 한 장 고치기·나누기·삭제 — 오늘 선곡만(임시). 곡 원본은 곡 제목 줄 [저장](src/control/setlistChanges.ts) */
function saveEdit(p: { pieces: string[]; indexes: number[] }) {
  const e = editing.value
  const it = e && live.state.setlist.find((x) => x.key === e.key)
  if (!e || !it) return
  const removing = p.pieces.length === 0
  const r = live.setlist.editSlides(e.key, p.indexes, p.pieces)
  if (r !== 'ok') {
    editing.value = null
    return say(r === 'last' ? '곡의 마지막 장은 지울 수 없습니다 — 곡을 빼려면 선곡에서'
      : r === 'frozen' ? 'FREEZE 중인 장은 지울 수 없습니다 — FREEZE 를 풀고 지우세요'
      : '그 사이 선곡이 바뀌어 저장하지 못했습니다 — 다시 열어 주세요', true)
  }
  editing.value = null
  const what = removing ? `${p.indexes.length}장 지웠습니다` : p.pieces.length > 1 ? `${p.pieces.length}장으로 나눴습니다` : '고쳤습니다'
  say(`${what} — 오늘 선곡만(곡 원본은 곡 제목 줄 [원본에 저장]으로)`)
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
    <p v-if="!live.state.setlist.length" class="empty">선곡에 곡을 추가하면 슬라이드가 여기에 펼쳐집니다.</p>
    <div v-if="live.state.setlist.length > 1" class="tools">
      <button @click="toggleAll">{{ allClosed ? '전체 펼치기' : '전체 접기' }}</button>
    </div>
    <div v-for="(it, i) in live.state.setlist" :key="it.key" class="song" :class="songState(i)" :data-item="i">
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
        <span v-if="i === air.itemIndex && air.slideIndex < 0 && !air.frozen" class="onair idle" title="선곡은 됐지만 아직 아무 장도 안 나감 — 장을 누르거나 ▶">○ 송출 대기</span>
        <span v-else-if="i === air.itemIndex" class="onair" :class="{ blanked: air.blank, frozen: air.frozen }">
          {{ air.frozen ? '❄ FREEZE' : air.blank ? '● BLANK' : '● 송출 중' }} {{ air.slideIndex < 0 ? '' : `${air.slideIndex + 1}/${it.slides.length}` }}
        </span>
        <span v-if="isHost" class="h-acts" @click.stop>
          <template v-if="isChanged(it)">
            <span class="changed" title="오늘 선곡에서 바꾼 슬라이드(순서·가사)가 곡 원본에 저장되지 않음">변경됨</span>
            <button class="h-btn primary save-item" :disabled="savingKey === it.key" title="오늘 바꾼 슬라이드(순서·가사)를 이 기기의 곡 원본에 저장 — DB 에는 곡 목록의 ⬆ 업로드로" @click="saveItem(it)">원본에 저장</button>
          </template>
          <button v-if="!isMediaItem(it)" class="h-btn" title="곡 편집기 — 저장하면 곡 원본과 오늘 선곡이 함께 바뀜" @click="editSong(it)">곡 편집</button>
          <button class="h-btn danger-line exclude" title="선곡에서 빼기(곡 목록의 곡은 그대로)" @click="exclude(it)">선곡 제외</button>
        </span>
      </h3>
      <p v-if="!isClosed(it.key) && !it.slides.length" class="noslide">슬라이드 없음</p>
      <VueDraggable
        v-if="!isClosed(it.key)"
        :model-value="models[it.key] ?? []"
        @update:model-value="(v: CardRef[]) => (models[it.key] = v)"
        class="cards"
        :disabled="!isHost"
        :animation="150"
        :delay="300"
        :delay-on-touch-only="true"
        :force-fallback="true"
        :fallback-tolerance="6"
        filter=".more, .more-menu"
        :prevent-on-filter="false"
        ghost-class="drag-ghost"
        @start="onDragStart"
        @end="onDragEnd(it.key, $event)"
      >
        <div v-for="c in models[it.key] ?? []" :key="c.id" class="cell">
        <button
          class="card"
          :class="{ live: isLive(i, c.j), frozen: isLive(i, c.j) && air.frozen, pvw: isPreview(i, c.j), ctl: isCtl(i, c.j), blanked: isLive(i, c.j) && air.blank }"
          @click="onClick(i, c.j)"
          @dblclick="onDbl(i, c.j)"
        >
          <span class="idx">{{ c.j + 1 }}</span>
          <span v-if="isMediaSlide(textOf(it, c.j))" class="thumb"><MediaImage :id="mediaIdOf(textOf(it, c.j))" compact /></span>
          <span v-else v-fit-lines="textOf(it, c.j)" class="txt">{{ textOf(it, c.j) }}</span>
        </button>
        <!-- ⋯ = 카드 밖 형제 버튼(카드 클릭 = 송출). 그림 장은 편집 없이 복사만(그림은 PowerPoint 에서 고쳐 다시 넣기) -->
        <button v-if="isHost" class="more" :class="{ on: isMenu(it.key, c.j) }" title="더 보기 — 편집·복사·삭제" aria-label="이 슬라이드 더 보기" aria-haspopup="menu" @click.stop="toggleMenu(it.key, c.j)">⋯</button>
        <div v-if="isMenu(it.key, c.j)" class="more-menu" role="menu" @click.stop>
          <button v-if="!isMediaSlide(textOf(it, c.j))" role="menuitem" class="m-edit" @click="menuEdit">✎ 이 장 편집</button>
          <button role="menuitem" class="m-copy" @click="menuCopy">⧉ 복사 <small>바로 뒤에</small></button>
          <button role="menuitem" class="m-del" @click="menuDelete">🗑 삭제 <small>이 장만</small></button>
        </div>
        </div>
      </VueDraggable>
    </div>
    <!-- 메뉴 바깥 누르면 닫힘(PC 는 투명, 폰은 어둡게 + 메뉴는 아래 시트) -->
    <div v-if="menu" class="more-backdrop" @click="menu = null" />
    <SlideEditDialog v-if="editing" :item-key="editing.key" :slide-index="editing.j" @close="editing = null" @save="saveEdit" />
    <SongEditor v-if="songEditing" :song="songEditing.song" :initial-slides="songEditing.initialSlides" @close="songEditing = null" @saved="onSongSaved" />
    <p v-if="notice" class="se-notice" :class="{ warn: notice.warn }" role="status">{{ notice.text }}</p>
  </section>
</template>

<style scoped>
/* 위쪽 padding 0: sticky 헤더가 padding 아래에 붙으면 그 틈으로 스크롤되는 카드가 비쳐 보임 */
/* 아래 여백 작게(예전 40vh = 마지막 곡도 맨 위로 올리려던 것 — 짧은 마지막 곡일수록 크게 비어 보여서 뺌. 마지막 곡은 맨 끝이라 안 올라가도 다 보인다) */
.grid-wrap { overflow-y: auto; padding: 0 8px 16px; min-height: 0; background: var(--bg); /* 곡 제목 줄 모서리 메움과 같은 색 */ }
.empty { color: var(--muted); text-align: center; margin-top: 30vh; }
 /* 곡 하나 = 박스 하나(제목 줄 + 그 곡의 슬라이드) — 어디까지가 한 곡인지 보이게(2026-11-26 사용자 요청) */
.song { margin-bottom: 14px; scroll-margin-top: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
/*
 * 2026-11-26 사용자 결정: 송출 중인 곡 = 박스(제목 줄 포함) 바탕을 옅은 초록으로(빛은 너무 옅어 안 보여서 바꿈), 테두리는 회색 그대로.
 * 송출 중인 장 = 카드 초록 테두리 + 더 진한 초록 바탕 — 박스 바탕은 카드보다 한참 옅게 해야 카드가 묻히지 않는다.
 * 제목 줄도 같은 색(위에 붙었을 때도 어느 곡인지 보이게). BLANK = 옅은 노랑 · FREEZE = 옅은 하늘(같은 방식, 사용자 결정) · 대기 곡만 평소 바탕
 */
.song.on.live, .song.on.live > h3 { background: #1b2a21; }
.song.on.blk, .song.on.blk > h3 { background: #27231a; } /* BLANK = 옅은 노랑(초록보다 더 옅게 — 진하면 경고처럼 보임) */
.song.on.frz, .song.on.frz > h3 { background: #1a2530; } /* FREEZE = 옅은 하늘(걸어 둔 걸 잊지 않게) */
.tools { display: flex; justify-content: flex-end; padding: 6px 0; }.tools button { font-size: 14px; color: var(--muted); }
h3 {
  /* 박스 윗부분. 스크롤하면 화면 위에 붙음(긴 곡을 내려도 어느 곡인지 보이게) — 바탕을 칠해 아래 카드가 비치지 않게 */
  position: sticky; top: 0; z-index: 2; /* ⋯(z-index 1)보다 위 — 스크롤하면 곡 제목 아래로 들어가게 */ padding: 8px 12px; font-size: 14px; cursor: pointer; user-select: none;
  /* 박스 테두리 위에 겹쳐(-1px) 자기 테두리를 그린다 — 위에 붙었을 때도 둥근 박스 윗부분으로 보이게(박스 옆선이 모서리 틈으로 비치지 않게) */
  margin: -1px -1px 0; border: 1px solid var(--line);
  background: var(--panel); border-radius: 10px 10px 0 0; display: flex; align-items: baseline; gap: 8px;
}
h3.closed { border-bottom: 0; border-radius: 10px; }
/*
 * 둥근 위 모서리 바깥(투명한 틈)을 목록 바탕색으로 메운다 — 제목 줄이 위에 붙으면 그 틈으로 박스 옆선·아래로 지나가는 카드가
 * 삐져나와 보였다(2026-11-26 사용자 지적). 붙지 않았을 땐 원래 바탕과 같은 색이라 차이 없음.
 * (박스에 overflow: clip 으로 자르는 방법은 PC ⋯ 메뉴(카드 아래로 펼쳐짐)까지 잘라서 쓰지 않음)
 */
/* 경계는 둥근 선 안쪽(9~9.6px)에서 끝낸다 — 선 바깥쪽 반투명 픽셀(안티앨리어싱)로 밑의 송출 카드 초록이 점처럼 비쳤다 */
h3::before, h3::after { content: ''; position: absolute; top: -1px; width: 10px; height: 10px; pointer-events: none; }
h3::before { left: -1px; background: radial-gradient(circle at 100% 100%, transparent 9px, var(--bg) 9.6px); }
h3::after { right: -1px; background: radial-gradient(circle at 0 100%, transparent 9px, var(--bg) 9.6px); }
h3.live { color: #fff; }
h3 .chev { width: 10px; color: var(--muted); font-size: 11px; }
h3 .no { color: var(--muted); font-size: 12px; }
h3 .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
h3 small { color: var(--muted); font-weight: normal; font-size: 12px; white-space: nowrap; }
.onair { font-size: 11px; font-weight: 700; color: var(--live); white-space: nowrap; }
.onair.blanked { color: var(--warn); }
.onair.frozen { color: var(--freeze); }
.onair.idle { color: var(--muted); font-weight: 600; }
.noslide { color: var(--muted); font-size: 12px; margin: 0; padding: 8px 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; padding: 10px; }
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
.card.live { border-color: var(--live); background: var(--live-bg); }
.card.live.frozen { border-color: var(--freeze); background: #0c2430; }
.card.live.frozen .idx { color: var(--freeze); }
.card.live .txt { color: #fff; }
.card.blanked .txt, .card.blanked .thumb { opacity: .35; }
/* 그림 장: 카드 안(번호 자리 아래)을 그림으로 채움 */
.thumb { position: absolute; inset: 18px 6px 6px; border-radius: 3px; overflow: hidden; }
.cell { position: relative; min-width: 0; display: grid; }
/* ⋯ = 카드 오른쪽 위 구석(카드 클릭 = 송출이므로 카드 밖 형제 버튼, 누를 자리 충분히). PC 는 마우스를 올렸을 때(또는 메뉴가 열려 있을 때)만 */
.more {
  position: absolute; top: 8px; right: 8px; /* 카드 테두리에서 띄움(2026-11-26 — 붙어 보였음) */ width: 36px; height: 32px; padding: 0; margin: 0; z-index: 1;
  font-size: 18px; font-weight: 700; line-height: 1; border-radius: 6px; background: rgba(20, 20, 26, .9); box-shadow: none; color: #cfd3dc;
}
.more:active { transform: none; }
.more:hover, .more.on { border-color: var(--accent); color: #fff; }
@media (hover: hover) { .more { opacity: 0; } .cell:hover .more, .more:focus-visible, .more.on { opacity: 1; } }
/* ⋯ 메뉴: PC = 버튼 아래 작은 목록. 바깥(.more-backdrop, 투명)을 누르면 닫힘 */
.more-menu {
  position: absolute; top: 44px; right: 8px; z-index: 31; min-width: 150px; display: grid; gap: 2px; padding: 4px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 10px 30px rgba(0, 0, 0, .5);
}
.more-menu button { margin: 0; box-shadow: none; text-align: left; font-size: 14px; padding: 8px 10px; background: none; border-color: transparent; }
.more-menu button:hover { background: var(--panel-2); border-color: var(--line); }
.more-menu small { color: var(--muted); font-size: 12px; margin-left: 4px; }
.more-menu .m-del { color: #ff9b9b; }
.more-backdrop { position: fixed; inset: 0; z-index: 30; }
/* 끌기 중 자리 표시 */
.drag-ghost { opacity: .35; }
.drag-ghost .card { border-style: dashed; border-color: var(--accent); }
/* 곡 제목 줄 [편집][삭제] — 보통 크기 버튼(14px 규칙), 제목 줄 높이에 맞춰 여백만 줄임 */
.h-acts { display: flex; align-items: center; gap: 4px; margin-left: 4px; }
.changed { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 4px; color: var(--warn); border: 1px solid var(--warn); white-space: nowrap; }
.h-btn { font-size: 14px; padding: 2px 10px; margin: 0; white-space: nowrap; }
.se-notice {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 47; margin: 0; max-width: calc(100vw - 32px);
  padding: 8px 14px; border-radius: 8px; background: #1d2a22; border: 1px solid var(--live); color: #c9f5d9; font-size: 13px;
}
.se-notice.warn { background: #2e2614; border-color: var(--warn); color: #ffe7a8; }
.idx { position: absolute; top: 4px; left: 6px; font-size: 11px; color: var(--muted); }
.card.live .idx { color: var(--live); font-weight: 700; }
@media (max-width: 768px) {
  .grid-wrap { padding: 0 4px 16px; } /* 아래 송출 버튼 줄은 겹쳐 뜨지 않고 자기 자리를 차지하므로 큰 여백 불필요 */
  .empty { margin-top: 24px; } /* 30vh 면 좁은 폰에서 안내 글이 아래로 밀려 잘림 */
  /* 1열 행 목록: 16:9 고정을 풀고 글자 길이에 맞춰 높이가 정해지게 */
  .cards { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .card { aspect-ratio: auto; min-height: 52px; justify-content: flex-start; gap: 12px; padding: 10px 12px; text-align: left; }
  .idx { position: static; min-width: 16px; text-align: center; font-size: 12px; }
  /* .card .txt: 아래 기본 .txt 규칙보다 뒤에 있어도 이기도록(예전엔 순서 때문에 14px 가 안 먹고 12.5px 였음) */
  .card .txt { font-size: 14px; }
  /* 폰 행 목록: 번호 옆에 작은 16:9 그림 */
  .thumb { position: relative; inset: auto; flex: none; width: 96px; aspect-ratio: 16 / 9; }
  /* 폰: ⋯ 항상 보임(마우스 올리기 없음) — 글이 ⋯ 아래로 가지 않게 오른쪽 자리 비움 */
  .card { padding-right: 42px; gap: 8px; padding-left: 8px; }
  .more { top: 50%; right: 8px; transform: translateY(-50%); width: 32px; height: 34px; }
  .more:active { transform: translateY(-50%); }
  /* 폰: ⋯ 메뉴 = 아래 시트(폰 팝업 규칙 — 가운데·떠 있는 작은 창 대신) */
  .more-backdrop { background: rgba(0, 0, 0, .5); }
  .more-menu {
    position: fixed; top: auto; left: 0; right: 0; bottom: 0; min-width: 0; padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
    border-radius: 14px 14px 0 0; border-bottom: 0; gap: 6px;
  }
  .more-menu button { padding: 14px 12px; font-size: 15px; border-color: var(--line); background: var(--panel-2); }
  .h-btn { padding: 4px 10px; }
  /* 폰: 제목 줄 버튼은 둘째 줄 오른쪽(한 줄에 두면 곡 제목이 밀려 안 보이고 280px 에서 넘침) */
  h3 { flex-wrap: wrap; row-gap: 6px; }
  .h-acts { flex-basis: 100%; justify-content: flex-end; margin-left: 0; }
  .se-notice { bottom: 80px; }
  h3 { padding: 10px 10px; }
  /* 폰: 박스 안쪽 여백을 줄여 카드 폭을 지킨다(280px 에서 글자 크기) */
  .cards { padding: 4px; }
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
