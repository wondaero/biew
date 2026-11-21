<script setup lang="ts">
/**
 * 로컬 송출 → 인터넷 송출 전환(반대 방향은 없음 — 인터넷 송출은 끊겨도 PC 송출이 계속되므로).
 * 순서: 채널 이름·비밀번호 → 로그인 → 채널 생성 + 이 PC 를 호스트로 등록 →
 *       지금 송출(콘티·위치·FREEZE·출력 설정)을 그대로 옮김 → 출력 창은 화면을 유지한 채 새 채널로 갈아탐 → 📡 창 열기.
 * 로컬 송출의 콘티는 옮겨 갔으므로 비운다(출력 설정은 유지).
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { nextVersion, emptyLiveState } from '@shared/types'
import * as api from '@/channel/api'
import { useLive } from '@/live/liveStore'
import { saveHost, saveLive, LOCAL_CODE } from '@/live/persistence'
import { retargetOutputWindow } from './outputWindow'
import { requireLogin } from '@/lib/loginPrompt'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const live = useLive()

const d = new Date()
const title = ref(`${d.getMonth() + 1}/${d.getDate()} 예배`)
const controlPw = ref('')
const viewPw = ref('')
type Step = 'form' | 'working'
const step = ref<Step>('form')
// 뒤로가기 = 닫기. 옮기는 중(working)엔 닫지 않는다(✕ 도 숨김)
useBackClose(() => true, () => { if (step.value !== 'working') emit('close') })
const err = ref<string | null>(null)
const valid = computed(() => title.value.trim().length > 0 && controlPw.value.length >= 4 && (!viewPw.value || viewPw.value.length >= 4))

function next() {
  err.value = null
  if (!title.value.trim()) { err.value = '채널 이름을 입력하세요'; return }
  if (controlPw.value.length < 4) { err.value = '컨트롤 비밀번호는 4자 이상이어야 합니다'; return }
  if (viewPw.value && viewPw.value.length < 4) { err.value = '보기 비밀번호는 4자 이상이어야 합니다(비우면 누구나 볼 수 있음)'; return }
  // 로그인 안 돼 있으면 공용 로그인 팝업 → 로그인되면 바로 이어서
  void requireLogin('인터넷 송출 채널을 만들려면 로그인하세요.').then((ok) => { if (ok) void run() })
}

async function run() {
  step.value = 'working'
  err.value = null
  const r = await api.createChannel(title.value.trim(), controlPw.value, viewPw.value)
  if (r.error || !r.code) { err.value = r.error ?? '채널을 만들지 못했습니다'; step.value = 'form'; return }
  const code = r.code
  const g = await api.issueHostToken(code)
  saveHost(code, { title: title.value.trim(), token: g.grant?.token ?? null, controlTopic: g.grant?.controlTopic ?? null, viewTopic: g.grant?.viewTopic ?? null })

  // 지금 송출을 새 채널로(새 version 이라 출력 창·서버가 받아들임)
  const st = JSON.parse(JSON.stringify(live.state))
  st.version = nextVersion(st.version)
  saveLive(code, st)
  // 출력 창: 화면 그대로, 연결만 새 채널로
  try {
    const bc = new BroadcastChannel(`biew-live:${LOCAL_CODE}`)
    bc.postMessage({ type: 'switch-channel', code })
    bc.close()
  } catch { /* BroadcastChannel 없음 — 출력 창은 '출력 시작'으로 다시 */ }
  retargetOutputWindow(code)
  // 로컬 송출은 옮겨 갔으므로 비운다(출력 설정 유지). 출력 창은 이미 새 채널로 갈아타 영향 없음
  saveLive(LOCAL_CODE, { ...emptyLiveState(st.origin), version: nextVersion(st.version), style: st.style })
  router.push(`${api.controlPath(code)}?share=1`)
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step.value !== 'working') emit('close') }
usePauseHotkeys()
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @mousedown.self="step !== 'working' && emit('close')">
    <div class="dialog" role="dialog" aria-modal="true">
      <header>
        <h2>인터넷 송출로 전환</h2>
        <span class="spacer" />
        <button v-if="step !== 'working'" class="x" title="닫기" @click="emit('close')">✕</button>
      </header>
      <p class="muted">지금 송출(콘티·위치·FREEZE·출력 설정)을 그대로 새 인터넷 송출 채널로 옮깁니다. 프로젝터 화면은 끊기지 않습니다. 옮긴 뒤 폰 리모컨·보기를 쓸 수 있습니다.</p>

      <form v-if="step === 'form'" class="form" @submit.prevent="next">
        <label>채널 이름<input v-model="title" maxlength="60" /></label>
        <label>컨트롤 비밀번호 <small>(폰 리모컨용, 필수 4자 이상)</small>
          <input v-model="controlPw" type="password" autocomplete="new-password" autofocus />
        </label>
        <label>보기 비밀번호 <small>(선택 — 정하면 홈의 공개 채널에 7일간 보임, 비우면 QR·링크로만)</small>
          <input v-model="viewPw" type="password" autocomplete="new-password" />
        </label>
        <button class="primary" :disabled="!valid">다음</button>
      </form>

      <p v-else class="muted">채널을 만들고 송출을 옮기는 중…</p>
      <p v-if="err" class="err">{{ err }}</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .6); display: grid; place-items: center; padding: 16px; }
.dialog { width: min(440px, 100%); display: grid; gap: 12px; padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
header { display: flex; align-items: center; }
h2 { margin: 0; font-size: 16px; }
.spacer { flex: 1; }
.x { border: none; background: none; box-shadow: none; margin: 0; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.form { display: grid; gap: 10px; }
label { display: grid; gap: 4px; font-size: 13px; }
label small { color: var(--muted); font-weight: normal; }
button { padding: 10px; }
</style>
