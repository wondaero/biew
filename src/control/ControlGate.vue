<script setup lang="ts">
/**
 * /control/:code 진입 게이트. 접속한 기기에 따라 역할을 정한다.
 *  1. 이 PC 가 이 채널의 호스트 기록(만들 때 받은 호스트 토큰)을 갖고 있음 → 호스트. 로그인·인터넷 불필요
 *  2. 기록은 없지만 지금 채널을 만든 계정으로 로그인돼 있음 → 호스트로 등록할지 리모컨으로 들어갈지 고른다
 *     (로그인이 저장되므로 로그인된 폰이 컨트롤 링크를 열 때마다 두 번째 호스트가 되면 안 된다).
 *     홈 "내 계정의 채널"에서 연 경우(?as=host)는 묻지 않고 호스트로.
 *  3. 그 외 → 리모컨: 저장된 토큰 또는 컨트롤 비밀번호로 입장(이동·BLANK·점프만)
 * 호스트 판정은 로그인이 아니라 호스트 토큰 기준 — 로그아웃·오프라인에도 호스트 유지.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { session, authReady } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { startHostSync, stopHostSync, publishHost, startRemote, stopRemote, sendRemote, remoteRejected } from '@/channel/sync'
import { openHost, openRemote, closeChannel, adoptState, useLive } from '@/live/liveStore'
import { loadHost, saveHost, saveVisit } from '@/live/persistence'
import ControlView from './ControlView.vue'

const route = useRoute()
const live = useLive()
const code = computed(() => api.normalizeCode(String(route.params.code ?? '')))

type Phase = 'loading' | 'choose' | 'password' | 'ready' | 'error'
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

  // 1. 이 PC 의 호스트 기록 — 서버에 묻지 않는다(오프라인에서도 바로 열림). 토큰이 만료돼도 PC 송출은 되므로 호스트로 연다
  const hosted = loadHost(c)
  if (hosted) return enterHost(c, hosted.title, null)

  if (!supabase) return fail('Supabase 설정(.env)이 없어 채널 기능을 쓸 수 없습니다.')
  await waitAuth()
  if (my !== ticket) return

  // 2. 로그인한 소유자 → 호스트로 등록할지 고르기(홈 "내 계정의 채널"에서 왔으면 바로 호스트)
  if (session.value) {
    const { row } = await api.getChannel(c)
    if (my !== ticket) return
    if (row) {
      title.value = row.title
      if (route.query.as === 'host') return registerHost(c, my)
      phase.value = 'choose'
      return
    }
  }
  // 3. 리모컨
  await enterRemote(c, undefined, my)
}

/** 이 기기를 호스트로 등록(채널 전용 호스트 토큰 발급·저장) */
async function registerHost(c: string, my: number) {
  phase.value = 'loading'
  const g = await api.issueHostToken(c)
  if (my !== ticket) return
  if (!g.grant) return fail(g.error ?? '호스트 권한을 받지 못했습니다.')
  saveHost(c, { title: g.grant.title, token: g.grant.token, controlTopic: g.grant.controlTopic, viewTopic: g.grant.viewTopic })
  enterHost(c, g.grant.title, g.grant.state)
}
const chooseHost = () => void registerHost(code.value, ++ticket)
const chooseRemote = () => { phase.value = 'loading'; void enterRemote(code.value, undefined, ++ticket) }

/** serverState: 처음 등록할 때 받은 서버 상태(다른 PC·리모컨이 쓰던 것) — 더 새로우면 이어받는다 */
function enterHost(c: string, t: string, serverState: unknown) {
  title.value = t
  openHost(c, { publish: publishHost })
  adoptState(serverState)
  startHostSync(c, { getState: () => JSON.parse(JSON.stringify(live.state)), adopt: adoptState })
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
      saveVisit(c, 'control', title.value) // 홈 "이 기기의 채널"
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

    <!-- 로그인한 소유자가 이 기기에서 처음 연 채널: 역할 고르기 -->
    <div v-else-if="phase === 'choose'" class="card choose">
      <h1>{{ title || '채널' }}</h1>
      <p>이 채널을 만든 계정으로 로그인돼 있습니다. 이 기기를 어떻게 쓸까요?</p>
      <button class="primary" @click="chooseHost">이 기기를 호스트로<br /><small>송출 PC — 선곡·곡·출력 설정 전체 조작, 출력 창</small></button>
      <button @click="chooseRemote">리모컨으로<br /><small>이동·BLANK·점프만 (컨트롤 비밀번호)</small></button>
      <p><small>송출하는 PC 가 따로 있다면 리모컨을 고르세요. 호스트로 등록한 기기는 홈 "이 기기의 채널"에서 지울 수 있습니다.</small></p>
      <router-link to="/">← 처음으로</router-link>
    </div>

    <form v-else-if="phase === 'password'" class="card" @submit.prevent="submit">
      <h1>{{ title || '채널' }}</h1>
      <p>컨트롤 비밀번호를 입력하세요.<br /><small>한 번 입력하면 이 기기가 기억합니다.</small></p>
      <input v-model="pw" type="password" autocomplete="off" autofocus placeholder="컨트롤 비밀번호" />
      <button class="primary" :disabled="busy || !pw">입장</button>
      <p v-if="pwErr" class="err">{{ pwErr }}</p>
      <p><small>이 채널을 만든 계정이라면 처음 화면에서 로그인한 뒤 채널을 열면 이 PC 가 호스트(전체 컨트롤러)로 등록됩니다.</small></p>
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
.choose button small { font-size: 12px; color: inherit; opacity: .75; }
a { color: var(--accent); font-size: 13px; }
</style>
