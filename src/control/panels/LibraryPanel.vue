<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLibrary, syncStatus, syncError, lastSync, lastCheck } from '@/library/library'
import { session } from '@/lib/auth'
import { useSyncDialogs } from '../useSyncDialogs'
import { useLive } from '@/live/liveStore'
import type { Song } from '@shared/types'
import SongEditor from '../SongEditor.vue'
import UploadDialog from '../UploadDialog.vue'
import DownloadDialog from '../DownloadDialog.vue'
import { dbNotice } from '@/library/db'
import { canAutoFocus } from '@/lib/device'

const lib = useLibrary()
const live = useLive()
const q = ref('')
const sel = ref(0)
const input = ref<HTMLInputElement>()
const hits = computed(() => lib.search(q.value, 60))
watch(q, () => { sel.value = 0 })

/** 추가 알림 — 곡 검색이 팝업이라 뒤의 선곡이 안 보이므로 '몇 번째로 들어갔는지' 잠깐 보여 준다 */
const added = ref<string | null>(null)
let addedTimer: number | undefined
function add(i = sel.value) {
  const h = hits.value[i]
  if (!h) return
  live.setlist.add(h.song)
  added.value = `"${h.song.title}" — 선곡 ${live.state.setlist.length}번째로 추가`
  clearTimeout(addedTimer)
  addedTimer = window.setTimeout(() => { added.value = null }, 2500)
  if (canAutoFocus()) input.value?.select() // PC: 바로 다음 곡 검색. 폰: 키패드가 올라오지 않게 그대로
}
/** v-model 은 한글 조합이 끝날 때까지 값을 갱신하지 않아("안녕" 입력 중에도 "안"으로 검색) — 입력마다 바로 반영 */
function onInput(e: Event) {
  q.value = (e.target as HTMLInputElement).value
}
function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, hits.value.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); e.preventDefault() }
  else if (e.key === 'Enter') { add(); e.preventDefault() }
  // 검색어가 있으면 Esc = 검색어만 지움(팝업은 닫지 않게 preventDefault). 비어 있으면 그대로 올라가 팝업이 닫힌다
  else if (e.key === 'Escape' && q.value) { q.value = ''; e.preventDefault() }
}

// DB 와 주고받기 = [⬇ 다운로드]·[⬆ 업로드] 두 버튼(항상 보임). 누르면 비밀번호 재확인 → 목록 화면(useSyncDialogs)
const sync = useSyncDialogs()
const time = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const statusText = computed(() => {
  switch (syncStatus.value) {
    case 'loading': return '이 기기 곡 불러오는 중…'
    case 'checking': return 'DB 와 비교하는 중…'
    case 'downloading': return 'DB 에서 받는 중…'
    case 'offline': return '오프라인 — 이 기기 곡 사용 중'
    case 'error': return `DB 비교 실패: ${syncError.value}`
    default:
      if (!session.value) return '로그인하면 DB 와 비교합니다'
      if (lastCheck.value) return `DB 확인 ${time(lastCheck.value)}${lib.remoteCount.value ? ` · 받을 것 ${lib.remoteCount.value}곡` : ' · DB 와 같음'}`
      return lastSync.value ? `마지막 다운로드 ${time(lastSync.value)}` : '아직 받지 않음'
  }
})

// 편집기: undefined = 닫힘, null = 새 곡, Song = 수정. 오프라인·로그인 없이도 열 수 있다(PC 에 저장)
const editing = ref<Song | null | undefined>(undefined)
const notice = ref<string | null>(null)
function onSaved(song: Song) {
  q.value = song.title // 저장한 곡이 바로 보이도록
  notice.value = '이 기기에 저장했습니다. DB 에 올리려면 [⬆ 업로드].'
}
const online = ref(navigator.onLine)
window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))

defineExpose({
  focus: () => { if (canAutoFocus()) input.value?.focus() },
  /** 새 곡 편집기 바로 열기(사이드바 "+ 새 곡") */
  newSong: () => { editing.value = null },
  /** 안에 편집기·서버 올리기 창이 떠 있는지(그땐 바깥 검색 팝업이 Esc 로 닫히면 안 됨) */
  hasModal: () => editing.value !== undefined || !!sync.open.value,
})
</script>

<template>
  <section class="lib">
    <header>
      <div class="h">
        <h2>곡 라이브러리 <small>{{ lib.count.value }}곡</small></h2>
        <button class="new" title="새 곡 추가(오프라인이면 PC 에 저장)" @click="editing = null">+ 새 곡</button>
      </div>
      <!-- DB 와 주고받기(사용자 결정 2026-11-19): 항상 보임. 숫자 = 받을 것 / 올릴 것 -->
      <div class="sync">
        <button class="download" :class="{ has: lib.remoteCount.value }" title="DB → 이 기기: DB 와 다른 곡 목록에서 골라 받기(비밀번호 확인)" @click="sync.openDownload()">
          ⬇ 다운로드<b v-if="lib.remoteCount.value" class="cnt">{{ lib.remoteCount.value }}</b>
        </button>
        <button class="upload" :class="{ has: lib.pendingCount.value }" title="이 기기 → DB: 이 기기에서 바꾼 곡 골라 올리기(비밀번호 확인)" @click="sync.openUpload()">
          ⬆ 업로드<b v-if="lib.pendingCount.value" class="cnt">{{ lib.pendingCount.value }}</b>
        </button>
      </div>
      <p v-if="notice" class="notice" @click="notice = null">{{ notice }}</p>
      <p v-if="dbNotice" class="dbnotice">{{ dbNotice }}</p>
      <p class="status" :class="syncStatus">{{ statusText }}</p>
    </header>

    <!-- 곡이 하나도 없으면 눈에 띄게(처음엔 받아야 함) -->
    <button v-if="!lib.count.value && syncStatus !== 'loading'" class="primary login-first" @click="sync.openDownload()">⬇ 곡 받기 <small>(처음엔 DB 에서 곡을 받아야 합니다)</small></button>

    <input
      ref="input"
      :value="q"
      class="search"
      type="search"
      placeholder="제목·가사 검색  ( / )"
      @input="onInput"
      @keydown="onKey"
    />
    <p v-if="added" class="added" role="status">✓ {{ added }}</p>
    <ol class="hits">
      <li
        v-for="(h, i) in hits"
        :key="h.song.id"
        :class="{ sel: i === sel }"
        @mouseenter="sel = i"
        @click="editing = h.song"
      >
        <span class="title">{{ h.song.title }}</span>
        <span v-if="lib.localKind.value.get(h.song.id)" class="badge pc" title="PC 에만 있는 변경(아직 서버에 안 올라감)">PC</span>
        <span v-if="!h.inTitle" class="badge">가사</span>
        <span class="n">{{ h.song.slides.length }}</span>
        <button class="add" title="선곡에 추가 (Enter)" @click.stop="add(i)">+ 선곡</button>
      </li>
      <li v-if="q && !hits.length" class="empty">결과 없음</li>
    </ol>
    <SongEditor v-if="editing !== undefined" :song="editing" @close="editing = undefined" @saved="onSaved" />
    <UploadDialog v-if="sync.open.value === 'up'" @close="sync.close()" />
    <DownloadDialog v-if="sync.open.value === 'down'" @close="sync.close()" />
  </section>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; min-height: 0; gap: 8px; }
header .h { display: flex; align-items: center; gap: 6px; }
header h2 { margin: 0; font-size: 14px; flex: 1; }
.new { font-size: 14px; white-space: nowrap; }
/* 곡 누르기 = 보기·수정(편집기), 선곡 추가는 오른쪽 버튼으로만(사용자 결정 2026-11-19 — 잘못 눌러 선곡에 들어가지 않게). Enter 는 그대로 추가(키보드 빠른 길) */
.add { font-size: 14px; white-space: nowrap; }
header small { color: var(--muted); font-weight: normal; margin-left: 4px; }
.sync { display: flex; gap: 6px; margin-top: 6px; }
.sync button { flex: 1; min-width: 0; font-size: 14px; white-space: nowrap; }
.sync .cnt { margin-left: 6px; padding: 0 6px; border-radius: 8px; font-size: 12px; }
.download.has { border-color: var(--accent); }
.download .cnt { background: rgba(79, 140, 255, .25); color: #dbe7ff; }
.upload.has { border-color: #8a6d24; color: var(--warn); }
.upload .cnt { background: #5a4a1e; color: #f5d27a; }
.status { margin: 4px 0 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status.error { color: var(--pgm); }
.status.offline { color: var(--warn); }
.login-first { width: 100%; padding: 8px; }
.login-first small { font-weight: normal; opacity: .8; }
.search { width: 100%; }
.hits { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 0; }
.hits li { display: flex; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
.hits li.sel { background: var(--panel-2); }
.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #3a3a46; color: #bbb; }
.badge.pc { background: #5a4a1e; color: #f5d27a; }
.notice { margin: 6px 0 0; font-size: 12px; color: var(--warn); cursor: pointer; }
.dbnotice { margin: 6px 0 0; font-size: 12px; color: var(--warn); }
.n { font-size: 11px; color: var(--muted); }
.empty { color: var(--muted); cursor: default !important; }
.added { margin: 0; font-size: 12px; color: var(--live); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
