<script setup lang="ts">
/**
 * /control/:code 진입 게이트. 접속자가 누구인지에 따라 역할을 정한다.
 *  - 이 채널을 만든 계정으로 로그인됨 → 호스트(전체 컨트롤러)
 *  - 그 외 → 리모컨: 저장된 토큰 또는 컨트롤 비밀번호로 입장(이동·BLANK·점프만)
 * 호스트로 한 번 연 브라우저는 오프라인에서 새로고침해도 호스트로 다시 열린다(인터넷이 끊겨도 송출이 멈추면 안 되므로).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { session, authReady } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { startHostSync, stopHostSync, publishHost, startRemote, stopRemote, sendRemote, remoteRejected } from '@/channel/sync'
import { openHost, openRemote, closeChannel, handleCommand, adoptState, useLive } from '@/live/liveStore'
import { markHosted, hostedTitle } from '@/live/persistence'
import ControlView from './ControlView.vue'

const route = useRoute()
const live = useLive()
const code = computed(() => api.normalizeCode(String(route.params.code ?? '')))

type Phase = 'loading' | 'password' | 'ready' | 'error'
const phase = ref<Phase>('loading')
const title = ref('')
const msg = ref('')
const pw = ref('')
const pwErr = ref<string | null>(null)
const busy = ref(false)
let ticket = 0 // 진입이 겹칠 때 늦게 끝난 쪽을 버린다

function teardown() {
  stopHostSync(); stopRemote(); closeChannel()
}
function fail(m: string) { msg.value = m; phase.value = 'error' }

async function waitAuth() {
  for (let i = 0; i < 100 && !authReady.value; i++) await new Promise((r) => setTimeout(r, 50))
}

async function enter() {
  const my = ++ticket
  teardown()
  phase.value = 'loading'
  pwErr.value = null
  const c = code.value
  if (!api.isCode(c)) return fail('잘못된 채널 번호입니다.')
  if (!supabase) return fail('Supabase 설정(.env)이 없어 채널 기능을 쓸 수 없습니다.')
  await waitAuth()
  if (my !== ticket) return

  if (session.value) {
    const { row, error } = await api.getChannel(c)
    if (my !== ticket) return
    if (row) return enterHost(c, row.title, row.state)
    if (error) {
      // 오프라인 등으로 확인 실패: 이 브라우저가 호스트로 연 적 있으면 호스트로 다시 연다
      const t = hostedTitle(c)
      if (t) return enterHost(c, t, null)
    }
  }
  await enterRemote(c, undefined, my)
}

function enterHost(c: string, t: string, serverState: unknown) {
  title.value = t
  markHosted(c, t)
  openHost(c, { publish: publishHost })
  adoptState(serverState) // 서버 쪽이 더 새로우면(다른 PC 에서 이어서 열 때) 따라간다
  startHostSync(c, { onCommand: handleCommand, getState: () => JSON.parse(JSON.stringify(live.state)) })
  phase.value = 'ready'
}

async function enterRemote(c: string, password: string | undefined, my: number) {
  busy.value = true
  const j = await api.joinControl(c, password)
  busy.value = false
  if (my !== ticket) return
  switch (j.status) {
    case 'ok':
      title.value = j.title ?? c
      openRemote(c, sendRemote)
      startRemote(c, j, (s) => adoptState(s))
      phase.value = 'ready'
      return
    case 'password_required': case 'token_rejected':
      title.value = j.title ?? ''; phase.value = 'password'; return
    case 'bad_password':
      phase.value = 'password'; pwErr.value = '비밀번호가 맞지 않습니다'; return
    case 'locked':
      phase.value = 'password'; pwErr.value = '시도가 너무 많습니다. 잠시 후 다시 시도하세요'; return
    case 'not_found':
      return fail('채널을 찾을 수 없습니다. 번호를 확인하세요. (삭제된 채널일 수 있습니다)')
    default:
      return fail(j.error ? `서버에 연결할 수 없습니다: ${j.error}` : '서버에 연결할 수 없습니다.')
  }
}

function submit() {
  void enterRemote(code.value, pw.value, ++ticket)
  pw.value = ''
}

// 리모컨 토큰이 거부되면(접속 끊기·비밀번호 변경·만료) 비밀번호 입력으로 돌아간다
watch(remoteRejected, (v) => { if (v) void enter() })
watch(code, () => void enter())

onMounted(() => void enter())
onBeforeUnmount(() => { ticket++; teardown() })
</script>

<template>
  <ControlView v-if="phase === 'ready'" :key="code" :title="title" />

  <main v-else class="gate">
    <div v-if="phase === 'loading'" class="card"><p>불러오는 중…</p></div>

    <form v-else-if="phase === 'password'" class="card" @submit.prevent="submit">
      <h1>{{ title || '채널' }}</h1>
      <p>컨트롤 비밀번호를 입력하세요.<br /><small>한 번 입력하면 이 기기가 기억합니다.</small></p>
      <input v-model="pw" type="password" autocomplete="off" autofocus placeholder="컨트롤 비밀번호" />
      <button class="primary" :disabled="busy || !pw">입장</button>
      <p v-if="pwErr" class="err">{{ pwErr }}</p>
      <router-link to="/">← 처음으로</router-link>
    </form>

    <div v-else class="card">
      <p>{{ msg }}</p>
      <router-link to="/">← 처음으로</router-link>
    </div>
  </main>
</template>

<style scoped>
.gate { min-height: 100dvh; display: grid; place-content: center; padding: 24px; }
.card { display: grid; gap: 12px; width: min(340px, 100%); text-align: center; }
h1 { margin: 0; font-size: 20px; }
p { margin: 0; color: var(--muted); font-size: 13px; }
small { color: var(--muted); }
.err { color: var(--pgm); }
button { padding: 12px; font-size: 16px; }
a { color: var(--accent); font-size: 13px; }
</style>
