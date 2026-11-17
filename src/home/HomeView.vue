<script setup lang="ts">
/** / — 채널 만들기·목록(로그인한 계정) + 번호로 입장(누구나) */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { session, authReady, signIn, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'

const router = useRouter()

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

// 채널 목록
const rows = ref<api.ChannelRow[]>([])
const listErr = ref<string | null>(null)
const loading = ref(false)
async function load() {
  if (!session.value) { rows.value = []; return }
  loading.value = true
  const r = await api.listChannels()
  rows.value = r.rows
  listErr.value = r.error ?? null
  loading.value = false
}
watch(session, load)
onMounted(() => { document.title = 'Biew'; void load() })

// 채널 만들기
const title = ref('')
const controlPw = ref('')
const viewPw = ref('')
const createErr = ref<string | null>(null)
const creating = ref(false)
async function create() {
  createErr.value = null
  if (!title.value.trim()) { createErr.value = '채널 제목을 입력하세요'; return }
  if (controlPw.value.length < 4) { createErr.value = '컨트롤 비밀번호는 4자 이상이어야 합니다'; return }
  if (viewPw.value && viewPw.value.length < 4) { createErr.value = '보기 비밀번호는 4자 이상이어야 합니다(비우면 누구나 볼 수 있음)'; return }
  creating.value = true
  const r = await api.createChannel(title.value.trim(), controlPw.value, viewPw.value)
  creating.value = false
  if (r.error || !r.code) { createErr.value = r.error ?? '만들지 못했습니다'; return }
  router.push(`/control/${r.code}`)
}

// 번호로 입장 (로그인 불필요)
const joinRaw = ref('')
const joinCode = computed(() => api.normalizeCode(joinRaw.value))
const joinOk = computed(() => api.isCode(joinCode.value))
const go = (kind: 'view' | 'control') => { if (joinOk.value) router.push(`/${kind}/${joinCode.value}`) }

const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <main class="home">
    <h1>Biew</h1>

    <p v-if="!supabase" class="warn">Supabase 설정(.env)이 없어 채널 기능을 쓸 수 없습니다.</p>

    <!-- 번호로 입장 -->
    <section class="card">
      <h2>채널 번호로 입장</h2>
      <input
        :value="joinCode"
        class="code"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="12"
        placeholder="ABC234"
        @input="joinRaw = ($event.target as HTMLInputElement).value"
        @keydown.enter="go('view')"
      />
      <div class="row">
        <button :disabled="!joinOk" @click="go('view')">보기</button>
        <button :disabled="!joinOk" @click="go('control')">컨트롤 (리모컨)</button>
      </div>
    </section>

    <template v-if="supabase && authReady">
      <!-- 로그인 전 -->
      <form v-if="!session" class="card" @submit.prevent="login">
        <h2>채널 만들기 · 관리</h2>
        <p class="muted">채널을 만들려면 스태프 계정으로 로그인하세요.</p>
        <input v-model="email" type="email" placeholder="이메일" autocomplete="username" required />
        <input v-model="pw" type="password" placeholder="비밀번호" autocomplete="current-password" required />
        <button class="primary" :disabled="busy">로그인</button>
        <p v-if="loginErr" class="err">{{ loginErr }}</p>
      </form>

      <!-- 로그인 후 -->
      <template v-else>
        <form class="card" @submit.prevent="create">
          <h2>새 채널</h2>
          <input v-model="title" placeholder="채널 제목 (예: 주일 2부)" maxlength="60" />
          <input v-model="controlPw" type="password" placeholder="컨트롤 비밀번호 (필수, 4자 이상)" autocomplete="new-password" />
          <input v-model="viewPw" type="password" placeholder="보기 비밀번호 (선택 — 비우면 번호만 알면 누구나)" autocomplete="new-password" />
          <button class="primary" :disabled="creating">채널 만들기</button>
          <p v-if="createErr" class="err">{{ createErr }}</p>
        </form>

        <section class="card">
          <h2>내 채널 <small>{{ rows.length }}</small>
            <button class="ghost" @click="signOut()">로그아웃</button>
          </h2>
          <p v-if="loading" class="muted">불러오는 중…</p>
          <p v-else-if="listErr" class="err">{{ listErr }}</p>
          <p v-else-if="!rows.length" class="muted">아직 채널이 없습니다.</p>
          <ul v-else class="list">
            <li v-for="r in rows" :key="r.code" @click="router.push(`/control/${r.code}`)">
              <span class="t">{{ r.title }}</span>
              <span class="c">{{ r.code }}</span>
              <span class="d">{{ fmt(r.created_at) }}</span>
              <span v-if="r.has_view_password" class="lock" title="보기 비밀번호 있음">🔒</span>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.home { max-width: 520px; margin: 0 auto; padding: 24px 16px 64px; display: grid; gap: 16px; }
h1 { margin: 0; font-size: 22px; letter-spacing: .5px; }
h2 { margin: 0; font-size: 15px; display: flex; align-items: baseline; gap: 8px; }
h2 small { color: var(--muted); font-weight: normal; flex: 1; }
.card { display: grid; gap: 10px; padding: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.warn { margin: 0; color: var(--warn); font-size: 13px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.code { text-align: center; font: 700 26px/1 ui-monospace, monospace; letter-spacing: 6px; padding: 12px 8px; text-transform: uppercase; }
.row { display: flex; gap: 8px; }
.row button { flex: 1; padding: 10px; }
.card > button { padding: 10px; }
.ghost { margin-left: auto; padding: 2px 8px; font-size: 12px; font-weight: normal; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list li {
  display: grid; grid-template-columns: 1fr auto auto; grid-template-areas: 't c lock' 'd d d'; gap: 2px 10px; align-items: baseline;
  padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; cursor: pointer;
}
.list li:hover { border-color: #4a4a56; }
.t { grid-area: t; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c { grid-area: c; font: 12px ui-monospace, monospace; color: var(--muted); letter-spacing: 2px; }
.d { grid-area: d; font-size: 11px; color: var(--muted); }
.lock { grid-area: lock; font-size: 12px; }
</style>
