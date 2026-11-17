<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLibrary, syncStatus, syncError, lastSync, syncNow, resetCache } from '@/library/library'
import { session, signOut, authReady } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import LoginForm from '@/components/LoginForm.vue'
import { useLive } from '@/live/liveStore'
import type { Song } from '@shared/types'
import SongEditor from '../SongEditor.vue'

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
function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, hits.value.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); e.preventDefault() }
  else if (e.key === 'Enter') { add(); e.preventDefault() }
  else if (e.key === 'Escape') { q.value = '' }
}

// 로그인: 곡 받기(동기화)·곡 편집에만 필요. 저장되지 않으므로 필요할 때 펼쳐서 로그인
const showLogin = ref(false)

const statusText = computed(() => {
  switch (syncStatus.value) {
    case 'loading': return '캐시 불러오는 중…'
    case 'syncing': return '동기화 중…'
    case 'offline': return '오프라인 — 캐시 사용 중'
    case 'error': return `동기화 실패: ${syncError.value}`
    default: return lastSync.value ? `최신 (${new Date(lastSync.value).toLocaleString('ko-KR')})` : '동기화 전'
  }
})

// 편집기: undefined = 닫힘, null = 새 곡, Song = 수정
const editing = ref<Song | null | undefined>(undefined)
function onSaved(song: Song) {
  q.value = song.title // 저장한 곡이 바로 보이도록
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <section class="lib">
    <header>
      <div class="h">
        <h2>곡 라이브러리 <small>{{ lib.count.value }}곡</small></h2>
        <button v-if="session" class="new" title="새 곡 추가" @click="editing = null">+ 새 곡</button>
      </div>
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
      <button class="login-toggle" @click="showLogin = !showLogin">
        {{ showLogin ? '▾' : '▸' }} 로그인 — 새 곡 받기 · 곡 추가/수정{{ lib.count.value ? '' : ' (처음엔 곡을 받아야 합니다)' }}
      </button>
      <LoginForm v-if="showLogin || !lib.count.value" hint="받아 둔 곡은 로그인 없이 계속 쓸 수 있습니다. 로그인은 저장되지 않습니다." @done="showLogin = false" />
    </template>

    <input
      ref="input"
      v-model="q"
      class="search"
      type="search"
      placeholder="제목·가사 검색  ( / )"
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
        <span v-if="!h.inTitle" class="badge">가사</span>
        <span class="n">{{ h.song.slides.length }}</span>
        <button v-if="session" class="edit" title="곡 수정·삭제" @click.stop="editing = h.song">✎</button>
      </li>
      <li v-if="q && !hits.length" class="empty">결과 없음</li>
    </ol>
    <SongEditor v-if="editing !== undefined" :song="editing" @close="editing = undefined" @saved="onSaved" />
  </section>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; min-height: 0; gap: 8px; }
header .h { display: flex; align-items: center; gap: 6px; }
header h2 { margin: 0; font-size: 14px; flex: 1; }
.new { padding: 2px 8px; font-size: 12px; }
.edit { padding: 0 6px; border: none; background: none; color: var(--muted); visibility: hidden; }
.hits li:hover .edit, .hits li.sel .edit { visibility: visible; }
.edit:hover { color: var(--accent); }
@media (hover: none) { .edit { visibility: visible; } } /* 터치엔 hover 가 없어 ✎ 가 영영 안 보임 */
header small { color: var(--muted); font-weight: normal; margin-left: 4px; }
.status { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); margin-top: 4px; }
.status span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status.error span { color: var(--pgm); }
.status.offline span { color: var(--warn); }
.status button { padding: 2px 7px; font-size: 12px; }
.login-toggle { text-align: left; background: none; border: none; padding: 2px 0; color: var(--muted); font-size: 12px; }
.search { width: 100%; }
.hits { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 0; }
.hits li { display: flex; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
.hits li.sel { background: var(--panel-2); }
.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #3a3a46; color: #bbb; }
.n { font-size: 11px; color: var(--muted); }
.empty { color: var(--muted); cursor: default !important; }
</style>
