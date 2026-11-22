<script setup lang="ts">
/**
 * 보기 /view/:code — 로그인 불필요, 보기 전용.
 * join_view RPC 로 입장(보기 비밀번호가 있으면 입력, 한 번 맞으면 이 브라우저가 토큰을 기억) → 서버의 현재 상태 + view topic.
 * 이후 Realtime Broadcast 로 따라간다. 탭이 다시 보이거나 재연결되면 서버에서 다시 읽는다(끊긴 동안 놓친 변경 보정).
 * 송출 상태의 원본은 서버라 호스트 PC 가 꺼져 있어도 리모컨이 넘기면 따라간다.
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import type { LiveState } from '@shared/types'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { saveVisit } from '@/live/persistence'
import { SyncHub } from '@/sync/SyncHub'
import { SupabaseRealtimeTransport } from '@/sync/SupabaseRealtimeTransport'
import { onAir } from '@/live/nav'
import { useStylePreview } from '@/live/stylePreview'
import SlideRender from '@/components/SlideRender.vue'
import { useWakeLock } from '@/output/useWakeLock'
import { onStage } from '@/lib/stage'

// 넓은 화면(PC/태블릿)이면 송출 화면 그대로, 폰이면 가사 목록. 폰 가로(높이 작음)는 목록 유지
const mq = window.matchMedia('(min-width: 900px) and (min-height: 520px)')
const wide = ref(mq.matches)
const onMq = () => { wide.value = mq.matches }
mq.addEventListener('change', onMq)

const status = ref<'loading' | 'live' | 'reconnecting' | 'notfound' | 'error' | 'password'>('loading')

/**
 * 넓은 화면 = 송출 화면. 다른 기기(폰·태블릿 호스트)의 채널을 빔 PC 에 띄울 때 쓰므로 /output 과 같게:
 * 커서 숨김 · 클릭하면 전체화면 · 화면 꺼짐 방지 · 연결 점은 문제 있을 때만 · 새 버전 알림 안 띄움.
 * (/output 은 같은 PC 컨트롤러에서 BroadcastChannel 로 받아 인터넷 없이 동작 — 이 화면은 서버를 거친다)
 */
const stage = computed(() => wide.value && status.value !== 'password')
watch(stage, (on) => {
  onStage.value = on
  document.documentElement.classList.toggle('is-output', on)
}, { immediate: true })
useWakeLock() // 폰 가사 목록에서도 화면이 꺼지지 않게

const isFullscreen = ref(!!document.fullscreenElement)
const hintVisible = ref(true)
let hintTimer: number | undefined
function goFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
}
const onFs = () => { isFullscreen.value = !!document.fullscreenElement; if (isFullscreen.value) hintVisible.value = false }
document.addEventListener('fullscreenchange', onFs)

// 창이 가려지면 페이드가 끝나지 않을 수 있음 → 숨김 상태에선 컷(/output 과 같음)
const visible = ref(document.visibilityState === 'visible')

const route = useRoute()
const code = computed(() => api.normalizeCode(String(route.params.code ?? '')))
const state = ref<LiveState | null>(null)
const preview = useStylePreview(() => state.value?.version)
const title = ref('')
const pw = ref('')
const pwErr = ref<string | null>(null)
const busy = ref(false)
const list = ref<HTMLElement>()

let hub: SyncHub | null = null
/** 지금 듣고 있는 실시간 주소. '모든 기기 접속 끊기'로 바뀌면 새 주소로 다시 연결해야 실시간으로 따라온다 */
let topic: string | null = null

/** 서버에서 현재 상태를 다시 읽는다. 토큰이 거부되면(보기 비밀번호 변경 등) 입력 화면으로 */
async function catchUp() {
  const j = await api.joinView(code.value)
  if (j.status === 'ok') {
    if (j.viewTopic && topic && j.viewTopic !== topic) { void enter(); return } // 주소가 바뀜 → 다시 연결
    if (j.state) hub?.receive(j.state)
    return
  }
  if (j.status === 'password_required' || j.status === 'token_rejected') { teardown(); status.value = 'password'; return }
  if (j.status === 'not_found') { status.value = 'notfound'; state.value = null; return }
  if (!state.value) status.value = 'error'
}

function teardown() {
  document.removeEventListener('visibilitychange', onVis)
  clearInterval(timer)
  hub?.close()
  hub = null
}

let timer: number | undefined
async function enter(password?: string) {
  teardown()
  pwErr.value = null
  if (!supabase) { status.value = 'error'; return }
  if (!api.isCode(code.value)) { status.value = 'notfound'; return }
  busy.value = true
  status.value = 'loading'
  const j = await api.joinView(code.value, password)
  busy.value = false
  switch (j.status) {
    case 'ok': break
    case 'password_required': case 'token_rejected': title.value = j.title ?? ''; status.value = 'password'; return
    case 'bad_password': status.value = 'password'; pwErr.value = '비밀번호가 맞지 않습니다'; return
    case 'locked': status.value = 'password'; pwErr.value = '시도가 너무 많습니다. 잠시 후 다시 시도하세요'; return
    case 'not_found': status.value = 'notfound'; return
    default: status.value = 'error'; return
  }
  title.value = j.title ?? ''
  saveVisit(code.value, 'view', title.value) // 홈 "이 기기의 채널"
  topic = j.viewTopic
  const rt = new SupabaseRealtimeTransport(supabase, j.viewTopic!, {
    onStatus: (st) => {
      if (st === 'SUBSCRIBED') { if (status.value !== 'notfound') status.value = 'live'; void catchUp() }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') status.value = 'reconnecting'
    },
  })
  // 출력 설정 '바로 적용' 임시 설정도 받는다(넓은 화면 = 송출 화면만 그린다. 폰 가사 목록은 설정을 안 씀)
  hub = new SyncHub([rt], (s) => { state.value = s; status.value = 'live'; preview.onState(s) }, (m) => preview.onMessage(m))
  if (j.state) hub.receive(j.state)
  document.addEventListener('visibilitychange', onVis)
  timer = window.setInterval(() => void catchUp(), 30000)
}

/** 상태가 아직 없을 때: 연결됐는데 응답이 없으면 호스트 PC 가 꺼져 있거나 오프라인인 것 */
const waitText = computed(() =>
  status.value === 'error' ? '연결할 수 없습니다.' : status.value === 'live' ? '송출 대기 중 — 아직 선곡이 없습니다' : '불러오는 중…',
)

// 컨트롤러가 FREEZE 중이면 고정된 화면을 따라간다(실제 송출과 같게)
const air = computed(() => (state.value ? onAir(state.value) : null))
const item = computed(() => (state.value && air.value ? state.value.setlist[air.value.itemIndex] : undefined))
const nextItem = computed(() => (state.value && air.value ? state.value.setlist[air.value.itemIndex + 1] : undefined))
const text = computed(() => air.value?.text ?? null)
const layerKey = computed(() => (air.value ? `${air.value.itemIndex}:${air.value.slideIndex}` : 0))

// 현재 슬라이드를 화면 중앙 근처로
watch(
  () => [air.value?.itemIndex, air.value?.slideIndex],
  async () => {
    await nextTick()
    list.value?.querySelector('.slide.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
)

const onVis = () => { if (document.visibilityState === 'visible') void catchUp() }
// teardown 이 onVis 를 떼므로 화면 보임 여부(페이드/컷)는 따로
const onVisibility = () => { visible.value = document.visibilityState === 'visible' }

onMounted(() => {
  document.title = `${code.value} — 실시간 가사`
  document.addEventListener('visibilitychange', onVisibility)
  // 안내 문구가 송출 화면에 오래 남지 않도록 자동 숨김(/output 과 같음)
  hintTimer = window.setTimeout(() => { hintVisible.value = false }, 8000)
  void enter()
})
onBeforeUnmount(() => {
  mq.removeEventListener('change', onMq)
  document.removeEventListener('fullscreenchange', onFs)
  document.removeEventListener('visibilitychange', onVisibility)
  clearTimeout(hintTimer)
  onStage.value = false
  document.documentElement.classList.remove('is-output')
  teardown()
})
</script>

<template>
  <!-- 보기 비밀번호가 필요한 채널 -->
  <main v-if="status === 'password'" class="join">
    <form @submit.prevent="enter(pw)">
      <h1>{{ title || '채널' }}</h1>
      <p>보기 비밀번호를 입력하세요.</p>
      <input v-model="pw" type="password" autocomplete="off" autofocus placeholder="비밀번호" />
      <button class="primary" :disabled="busy || !pw">입장</button>
      <p v-if="pwErr" class="err">{{ pwErr }}</p>
    </form>
  </main>

  <!-- 넓은 화면: 송출 화면(출력과 같은 렌더러)만 전체로 -->
  <div v-else-if="wide" class="stage" @click="goFullscreen" @dblclick="goFullscreen">
    <SlideRender v-if="state" :text="text" :blank="air?.blank ?? false" :style-cfg="preview.style.value ?? state.style" :layer-key="layerKey" :animate="visible" />
    <p v-if="status === 'notfound'" class="wmsg">채널을 찾을 수 없습니다 — 번호 <b>{{ code }}</b> 가 삭제되었거나 잘못되었습니다.</p>
    <p v-else-if="!state" class="wmsg">{{ waitText }}</p>
    <!-- 연결 점은 문제가 있을 때만(정상일 땐 송출 화면에 아무것도 안 보이게) -->
    <span v-if="status !== 'live'" class="dot wdot" :class="status" :title="status" />
    <div v-if="hintVisible && !isFullscreen" class="hint">클릭하면 전체화면 (또는 F11)</div>
  </div>

  <div v-else class="viewer">
    <header>
      <div class="t">
        <strong>{{ item?.title ?? (title || '실시간 가사') }}</strong>
        <small v-if="item && air">{{ air.slideIndex + 1 }} / {{ item.slides.length }}</small>
      </div>
      <span class="dot" :class="status" :title="status" />
    </header>

    <main v-if="status === 'notfound'" class="msg">
      <p>채널을 찾을 수 없습니다.</p>
      <small>번호 <b>{{ code }}</b> 가 삭제되었거나 잘못되었습니다.</small>
    </main>
    <main v-else-if="status === 'error' && !state" class="msg"><p>연결할 수 없습니다.</p></main>
    <main v-else-if="!state" class="msg"><p>{{ waitText }}</p></main>

    <main v-else ref="list" class="slides" :class="{ blank: air?.blank }">
      <p
        v-for="(s, j) in item?.slides ?? []"
        :key="`${air?.itemIndex}-${j}`"
        class="slide"
        :class="{ cur: j === air?.slideIndex, past: j < (air?.slideIndex ?? 0) }"
      >{{ s }}</p>
      <p v-if="!item" class="msg">대기 중</p>
      <footer v-if="nextItem" class="next">다음 곡 · {{ nextItem.title }}</footer>
    </main>
  </div>
</template>

<style scoped>
.join { min-height: 100dvh; display: grid; place-content: center; padding: 24px; background: #0e0e11; color: #eee; }
.join form { display: grid; gap: 12px; width: min(320px, 100%); text-align: center; }
.join h1 { margin: 0; font-size: 20px; }
.join p { margin: 0; color: #999; font-size: 13px; }
.join .err { color: var(--pgm); }
.join button { padding: 12px; font-size: 16px; }
.stage { position: fixed; inset: 0; background: #000; color: #aaa; cursor: none; user-select: none; }
.hint {
  position: absolute; top: 12px; left: 12px; padding: 6px 10px; border-radius: 6px;
  font: 13px system-ui, sans-serif; color: #aaa; background: rgba(40, 40, 40, .85);
}
.wmsg { position: absolute; inset: 0; display: grid; place-content: center; margin: 0; font-size: 18px; text-align: center; }
.wdot { position: absolute; top: 12px; right: 12px; opacity: .6; }
.viewer { min-height: 100dvh; display: flex; flex-direction: column; background: #0e0e11; color: #eee; }
header {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; padding-top: max(12px, env(safe-area-inset-top));
  background: rgba(14, 14, 17, .92); backdrop-filter: blur(8px); border-bottom: 1px solid #26262c;
}
.t { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.t strong { font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t small { color: #888; flex: none; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #666; flex: none; }
.dot.live { background: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
.dot.reconnecting, .dot.loading { background: #f5a524; }
.dot.error, .dot.notfound { background: #ff3b3b; }
.slides { flex: 1; padding: 16px 16px 50dvh; }
.slide {
  margin: 0 0 14px; padding: 14px 16px; border-radius: 12px; white-space: pre-line; text-align: center;
  font-size: 19px; line-height: 1.55; color: #9a9aa3; background: #17171c; transition: all .2s;
}
.slide.past { opacity: .5; }
.slide.cur { color: #fff; background: #23232b; font-weight: 700; font-size: 22px; box-shadow: inset 0 0 0 2px #4f8cff; }
.slides.blank .slide.cur { box-shadow: inset 0 0 0 2px #555; color: #aaa; font-weight: 400; }
.next { text-align: center; color: #777; font-size: 14px; margin-top: 24px; }
.msg { flex: 1; display: grid; place-content: center; text-align: center; color: #aaa; padding: 24px; }
.msg p { margin: 0 0 6px; font-size: 17px; }
</style>
