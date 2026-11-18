<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLibrary, syncStatus, syncError, lastSync, syncNow, resetCache } from '@/library/library'
import { session, signOut, authReady } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { requireLogin } from '@/lib/loginPrompt'
import { useLive } from '@/live/liveStore'
import type { Song } from '@shared/types'
import SongEditor from '../SongEditor.vue'
import UploadDialog from '../UploadDialog.vue'
import { dbNotice } from '@/library/db'

const lib = useLibrary()
const live = useLive()
const q = ref('')
const sel = ref(0)
const input = ref<HTMLInputElement>()
const hits = computed(() => lib.search(q.value, 60))
watch(q, () => { sel.value = 0 })

function add(i = sel.value) {
  const h = hits.value[i]
  if (!h) return
  live.setlist.add(h.song)
  input.value?.select()
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
  else if (e.key === 'Escape') { q.value = '' }
}

// 로그인: 곡 받기(동기화)·곡 편집에만 필요. 공용 로그인 팝업(requireLogin) — 예전엔 여기에 로그인 칸이 펼쳐져 패널 위쪽을 차지했음
const login = () => requireLogin('로그인하면 새 곡을 받고 곡을 추가·수정할 수 있습니다. 받아 둔 곡은 로그인 없이 계속 쓸 수 있습니다.')

const statusText = computed(() => {
  switch (syncStatus.value) {
    case 'loading': return '캐시 불러오는 중…'
    case 'syncing': return '동기화 중…'
    case 'offline': return '오프라인 — 캐시 사용 중'
    case 'error': return `동기화 실패: ${syncError.value}`
    default: return lastSync.value ? `최신 (${new Date(lastSync.value).toLocaleString('ko-KR')})` : '동기화 전'
  }
})

// 편집기: undefined = 닫힘, null = 새 곡, Song = 수정. 오프라인·로그인 없이도 열 수 있다(PC 에 저장)
const editing = ref<Song | null | undefined>(undefined)
const notice = ref<string | null>(null)
function onSaved(song: Song, local: boolean) {
  q.value = song.title // 저장한 곡이 바로 보이도록
  notice.value = local ? 'PC 에 저장했습니다. 인터넷이 될 때 "↑ 서버에 올리기"로 올리세요.' : null
}
const showUpload = ref(false)
const online = ref(navigator.onLine)
window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <section class="lib">
    <header>
      <div class="h">
        <h2>곡 라이브러리 <small>{{ lib.count.value }}곡</small></h2>
        <button class="new" title="새 곡 추가(오프라인이면 PC 에 저장)" @click="editing = null">+ 새 곡</button>
      </div>
      <button v-if="lib.pendingCount.value" class="upload" :class="{ ready: online }" title="PC 에서 고치거나 등록한 곡을 서버로" @click="showUpload = true">
        ↑ 서버에 올리기 {{ lib.pendingCount.value }}건{{ online ? '' : ' (인터넷 연결 후)' }}
      </button>
      <p v-if="notice" class="notice" @click="notice = null">{{ notice }}</p>
      <p v-if="dbNotice" class="dbnotice">{{ dbNotice }}</p>
      <div class="status" :class="syncStatus">
        <span>{{ statusText }}</span>
        <template v-if="session">
          <button title="새로 바뀐 곡 받기" :disabled="syncStatus === 'syncing'" @click="syncNow()">↻</button>
          <button title="캐시를 지우고 전체 다시 받기" @click="resetCache()">전체</button>
          <button title="로그아웃" @click="signOut()">⎋</button>
        </template>
      </div>
    </header>

    <template v-if="authReady && !session && supabase">
      <!-- 곡이 하나도 없으면 눈에 띄게(처음엔 받아야 함), 있으면 작은 글자 버튼 -->
      <button v-if="!lib.count.value" class="primary login-first" @click="login">로그인해서 곡 받기 <small>(처음엔 곡을 받아야 합니다)</small></button>
      <button v-else class="login-toggle" @click="login">로그인 — 새 곡 받기 · 곡 추가/수정</button>
    </template>

    <input
      ref="input"
      :value="q"
      class="search"
      type="search"
      placeholder="제목·가사 검색  ( / )"
      @input="onInput"
      @keydown="onKey"
    />
    <ol class="hits">
      <li
        v-for="(h, i) in hits"
        :key="h.song.id"
        :class="{ sel: i === sel }"
        @mouseenter="sel = i"
        @click="add(i)"
      >
        <span class="title">{{ h.song.title }}</span>
        <span v-if="lib.localKind.value.get(h.song.id)" class="badge pc" title="PC 에만 있는 변경(아직 서버에 안 올라감)">PC</span>
        <span v-if="!h.inTitle" class="badge">가사</span>
        <span class="n">{{ h.song.slides.length }}</span>
        <button class="edit" title="곡 수정·삭제" @click.stop="editing = h.song">✎</button>
      </li>
      <li v-if="q && !hits.length" class="empty">결과 없음</li>
    </ol>
    <SongEditor v-if="editing !== undefined" :song="editing" @close="editing = undefined" @saved="onSaved" />
    <UploadDialog v-if="showUpload" @close="showUpload = false" />
  </section>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; min-height: 0; gap: 8px; }
header .h { display: flex; align-items: center; gap: 6px; }
header h2 { margin: 0; font-size: 14px; flex: 1; }
.new { padding: 4px 10px; font-size: 12px; }
.edit { padding: 0 6px; border: none; background: none; color: var(--muted); visibility: hidden; box-shadow: none; margin: 0; }
.hits li:hover .edit, .hits li.sel .edit { visibility: visible; }
.edit:hover { color: var(--accent); }
@media (hover: none) { .edit { visibility: visible; } } /* 터치엔 hover 가 없어 ✎ 가 영영 안 보임 */
header small { color: var(--muted); font-weight: normal; margin-left: 4px; }
.status { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); margin-top: 4px; }
.status span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status.error span { color: var(--pgm); }
.status.offline span { color: var(--warn); }
.status button { padding: 4px 8px; font-size: 12px; }
.login-toggle { text-align: left; background: none; border: none; padding: 2px 0; color: var(--muted); font-size: 12px; box-shadow: none; margin: 0; }
.login-first { width: 100%; padding: 8px; }
.login-first small { font-weight: normal; opacity: .8; }
.search { width: 100%; }
.hits { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 0; }
.hits li { display: flex; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
.hits li.sel { background: var(--panel-2); }
.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #3a3a46; color: #bbb; }
.badge.pc { background: #5a4a1e; color: #f5d27a; }
.upload { margin-top: 6px; width: 100%; padding: 5px 8px; font-size: 12px; color: var(--warn); --edge: #2e260f; border-color: #5a4a1e; background-color: rgba(245, 165, 36, .06); }
.upload.ready { background-color: #3a3014; }
.notice { margin: 6px 0 0; font-size: 12px; color: var(--warn); cursor: pointer; }
.dbnotice { margin: 6px 0 0; font-size: 12px; color: var(--warn); }
.n { font-size: 11px; color: var(--muted); }
.empty { color: var(--muted); cursor: default !important; }
</style>
