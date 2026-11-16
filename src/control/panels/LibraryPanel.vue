<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLibrary, syncStatus, syncError, lastSync, syncNow, resetCache } from '@/library/library'
import { session, signIn, signOut, authReady } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useLive } from '@/live/liveStore'

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

// 로그인
const email = ref('')
const pw = ref('')
const loginErr = ref<string | null>(null)
const busy = ref(false)
async function login() {
  busy.value = true
  loginErr.value = await signIn(email.value, pw.value)
  busy.value = false
  if (!loginErr.value) pw.value = ''
}

const statusText = computed(() => {
  switch (syncStatus.value) {
    case 'loading': return '캐시 불러오는 중…'
    case 'syncing': return '동기화 중…'
    case 'offline': return '오프라인 — 캐시 사용 중'
    case 'error': return `동기화 실패: ${syncError.value}`
    default: return lastSync.value ? `최신 (${new Date(lastSync.value).toLocaleString('ko-KR')})` : '동기화 전'
  }
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <section class="lib">
    <header>
      <h2>곡 라이브러리 <small>{{ lib.count.value }}곡</small></h2>
      <div class="status" :class="syncStatus">
        <span>{{ statusText }}</span>
        <template v-if="session">
          <button title="새로 바뀐 곡 받기" :disabled="syncStatus === 'syncing'" @click="syncNow()">↻</button>
          <button title="캐시를 지우고 전체 다시 받기" @click="resetCache()">전체</button>
          <button title="로그아웃" @click="signOut()">⎋</button>
        </template>
      </div>
    </header>

    <form v-if="authReady && !session && supabase" class="login" @submit.prevent="login">
      <p>곡을 받으려면 스태프 계정으로 로그인하세요.<br /><small>한 번 받은 곡은 오프라인에서도 쓸 수 있습니다.</small></p>
      <input v-model="email" type="email" placeholder="이메일" autocomplete="username" required />
      <input v-model="pw" type="password" placeholder="비밀번호" autocomplete="current-password" required />
      <button class="primary" :disabled="busy">로그인</button>
      <p v-if="loginErr" class="err">{{ loginErr }}</p>
    </form>

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
      </li>
      <li v-if="q && !hits.length" class="empty">결과 없음</li>
    </ol>
  </section>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; min-height: 0; gap: 8px; }
header h2 { margin: 0; font-size: 14px; }
header small { color: var(--muted); font-weight: normal; margin-left: 4px; }
.status { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); margin-top: 4px; }
.status span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status.error span { color: var(--pgm); }
.status.offline span { color: var(--warn); }
.status button { padding: 2px 7px; font-size: 12px; }
.login { display: grid; gap: 6px; padding: 10px; background: var(--panel-2); border-radius: 8px; }
.login p { margin: 0; font-size: 12px; }
.login small { color: var(--muted); }
.err { color: var(--pgm); }
.search { width: 100%; }
.hits { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 0; }
.hits li { display: flex; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
.hits li.sel { background: var(--panel-2); }
.title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #3a3a46; color: #bbb; }
.n { font-size: 11px; color: var(--muted); }
.empty { color: var(--muted); cursor: default !important; }
</style>
