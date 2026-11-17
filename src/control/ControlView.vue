<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useLive } from '@/live/liveStore'
import { hostLink, remoteLink } from '@/channel/sync'
import { forgetToken } from '@/channel/api'
import { LOCAL_CODE } from '@/live/persistence'
import { loadCache, syncNow } from '@/library/library'
import { openOutputWindow } from './outputWindow'
import { useHotkeys } from './useHotkeys'
import LibraryPanel from './panels/LibraryPanel.vue'
import SetlistPanel from './panels/SetlistPanel.vue'
import SlideGrid from './panels/SlideGrid.vue'
import MonitorPanel from './panels/MonitorPanel.vue'
import StylePanel from './panels/StylePanel.vue'
import ChannelPopover from './panels/ChannelPopover.vue'

defineProps<{ title: string }>()
const router = useRouter()
const live = useLive()
/** host = 이 PC(전체 기능) / remote = 폰 리모컨(이동·BLANK·점프만) */
const isHost = computed(() => live.role.value === 'host')
const code = computed(() => live.channelCode.value ?? '')
/** 오프라인 모드(/local): 채널이 없으니 📡·번호 표시 없음 */
const isLocalMode = computed(() => code.value === LOCAL_CODE)
const link = computed(() => (isHost.value ? hostLink.value : remoteLink.value))
const libRef = ref<InstanceType<typeof LibraryPanel>>()
const gridRef = ref<InstanceType<typeof SlideGrid>>()

useHotkeys(live, { focusSearch: () => libRef.value?.focus() })

// 출력 창 연결 표시(2초마다 오는 생존 신호 기준)
const now = ref(Date.now())
let tick: number | undefined
const outputOn = computed(() => live.outputSeenAt.value > 0 && now.value - live.outputSeenAt.value < 5000)

const toast = ref<string | null>(null)
let toastTimer: number | undefined
function say(msg: string, ms = 7000) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = null }, ms)
}
async function startOutput() {
  const r = await openOutputWindow(code.value)
  say(r.message)
}

const showHelp = ref(false)
const showChannel = ref(false)

/** 리모컨: 이 기기에 저장된 토큰을 지우고 나간다(다음엔 비밀번호를 다시 입력) */
function leaveRemote() {
  if (!confirm('이 기기에서 나갈까요? 다음에 들어올 때 비밀번호를 다시 입력해야 합니다.')) return
  forgetToken('control', code.value)
  router.push('/')
}

// 모바일 바텀시트 (PC 에선 CSS 가 무시하므로 상태만 있고 영향 없음)
const sheet = ref<'find' | 'style' | null>(null)
const tab = ref<'lib' | 'set'>('lib')
function openSheet(kind: 'find' | 'style', t?: 'lib' | 'set') {
  sheet.value = kind
  if (t) tab.value = t
}
function onJump(i: number) {
  gridRef.value?.scrollToItem(i)
  sheet.value = null
}

// 송출 중 실수로 컨트롤러를 닫는 것 방지(출력은 계속 유지되지만 조작 불가해짐)
const onBeforeUnload = (e: BeforeUnloadEvent) => { if (outputOn.value) e.preventDefault() }
// 앱 안 이동(로고 클릭)은 beforeunload 가 안 걸리므로 따로 확인
function goHome() {
  if (isHost.value && outputOn.value && !confirm('출력이 연결된 상태입니다. 채널 목록으로 나가면 조작이 끊깁니다(출력 창은 마지막 화면 유지). 나갈까요?')) return
  router.push('/')
}

onMounted(() => {
  document.title = `${isHost.value ? '컨트롤러' : '리모컨'} — Biew`
  if (isHost.value) {
    loadCache().then(() => syncNow())
    tick = window.setInterval(() => { now.value = Date.now() }, 1000)
    window.addEventListener('beforeunload', onBeforeUnload)
  }
})
onBeforeUnmount(() => {
  clearInterval(tick)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="control" :class="{ remote: !isHost }">
    <header class="top">
      <button class="brand" title="채널 목록" @click="goHome">Biew</button>
      <span class="ch"><b>{{ title }}</b> <code v-if="!isLocalMode">{{ code }}</code><small v-else>이 PC 전용 · 인터넷 불필요</small></span>

      <div class="group">
        <button title="이전 (←)" @click="live.actions.prev()">◀</button>
        <button title="다음 (→ / Space)" @click="live.actions.next()">▶</button>
        <button class="blank" :class="{ on: live.state.blank }" title="자막 내리기 (B)" @click="live.actions.toggleBlank()">
          {{ live.state.blank ? 'BLANK 해제' : 'BLANK' }}
        </button>
        <button
          v-if="isHost"
          class="freeze"
          :class="{ on: !!live.state.frozen }"
          title="송출 화면 고정 — 조작은 계속되지만 송출은 그대로 (F 로 걸기, 해제는 이 버튼)"
          @click="live.state.frozen ? live.actions.unfreeze() : live.actions.freeze()"
        >
          {{ live.state.frozen ? 'FREEZE 해제' : 'FREEZE' }}
        </button>
      </div>

      <label v-if="isHost" class="mode" title="켜면 카드 클릭 = 미리보기, Enter/TAKE = 송출">
        <input v-model="live.pvwMode.value" type="checkbox" /> PVW/PGM 분리
      </label>

      <span class="spacer" />

      <template v-if="isHost">
        <span class="conn desk-only" :class="{ on: outputOn }">{{ outputOn ? '출력 연결됨' : '출력 없음' }}</span>
        <button class="primary desk-only" @click="startOutput">출력 시작</button>
        <button v-if="!isLocalMode" class="share" :class="link" title="채널 번호 · QR · 접속 관리" @click="showChannel = !showChannel">📡 채널</button>
        <button class="desk-only" title="단축키" @click="showHelp = !showHelp">?</button>
      </template>
      <template v-else>
        <span class="conn" :class="{ on: link === 'live' }">{{ link === 'live' ? '연결됨' : link === 'connecting' ? '연결 중…' : '연결 안 됨' }}</span>
        <button title="이 기기 잊기" @click="leaveRemote">나가기</button>
      </template>
    </header>

    <div v-if="toast" class="toast" @click="toast = null">{{ toast }}</div>
    <ChannelPopover v-if="isHost && showChannel" :code="code" :title="title" @close="showChannel = false" />
    <div v-if="showHelp" class="help" @click="showHelp = false">
      <table>
        <tr><td>→ / Space</td><td>다음 슬라이드 (PVW 모드: 미리보기 송출)</td></tr>
        <tr><td>←</td><td>이전 슬라이드</td></tr>
        <tr><td>↓ / ↑</td><td>다음 곡 첫 장 / 이전 곡(또는 현재 곡) 첫 장</td></tr>
        <tr><td>1 ~ 9, 0</td><td>현재 곡의 N번째 (0 = 10번째)</td></tr>
        <tr><td>B</td><td>블랭크 토글</td></tr>
        <tr><td>F</td><td>프리즈 걸기 (송출 화면 고정, 조작은 계속). 해제는 FREEZE 버튼을 직접 클릭</td></tr>
        <tr><td>Enter</td><td>TAKE (미리보기 → 송출)</td></tr>
        <tr><td>/</td><td>검색창으로</td></tr>
        <tr><td>Esc</td><td>입력창에서 빠져나오기</td></tr>
      </table>
    </div>

    <div v-if="sheet" class="backdrop" @click="sheet = null" />

    <aside v-if="isHost" class="left" :class="{ open: sheet === 'find' }" :data-tab="tab">
      <div class="sheet-head">
        <button :class="{ on: tab === 'lib' }" @click="tab = 'lib'">곡 검색</button>
        <button :class="{ on: tab === 'set' }" @click="tab = 'set'">콘티 {{ live.state.setlist.length }}</button>
        <span class="spacer" />
        <button aria-label="닫기" @click="sheet = null">✕</button>
      </div>
      <LibraryPanel ref="libRef" class="lib" />
      <SetlistPanel class="set" @jump="onJump" />
    </aside>

    <main class="center">
      <SlideGrid ref="gridRef" />
    </main>

    <aside class="right">
      <MonitorPanel />
      <div v-if="isHost" class="style-sheet" :class="{ open: sheet === 'style' }">
        <div class="sheet-head">
          <span class="spacer" />
          <button aria-label="닫기" @click="sheet = null">✕</button>
        </div>
        <StylePanel />
      </div>
    </aside>

    <nav v-if="isHost" class="dock">
      <button @click="openSheet('find', 'lib')">🔍 곡 검색</button>
      <button @click="openSheet('find', 'set')">☰ 콘티 {{ live.state.setlist.length }}</button>
      <button @click="openSheet('style')">⚙ 출력 설정</button>
    </nav>
  </div>
</template>

<style scoped>
.control {
  height: 100vh;
  display: grid;
  /* minmax(0, …): 긴 제목/nowrap 텍스트가 열을 밀어내지 않도록 */
  grid-template-columns: 300px minmax(0, 1fr) 400px;
  grid-template-rows: auto 1fr;
  grid-template-areas: 'top top top' 'left center right';
  overflow: hidden;
}
.top { grid-area: top; display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { font-size: 15px; font-weight: 700; letter-spacing: .5px; background: none; border: none; padding: 0; }
.ch { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 13px; }
.ch b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 26ch; }
.ch code, .ch small { color: var(--muted); font-size: 12px; }
.share.live { border-color: var(--pvw); color: var(--pvw); }
.share.error { border-color: var(--pgm); }
.group { display: flex; gap: 4px; }
.blank.on { background: var(--warn); border-color: var(--warn); color: #222; font-weight: 700; }
.freeze.on { background: var(--freeze); border-color: var(--freeze); color: #04212e; font-weight: 700; }
.mode { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); cursor: pointer; }
.spacer { flex: 1; }
.conn { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.conn::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #555; }
.conn.on { color: var(--text); }
.conn.on::before { background: var(--pvw); box-shadow: 0 0 6px var(--pvw); }

.left { grid-area: left; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); min-width: 0; gap: 12px; padding: 10px; border-right: 1px solid var(--line); min-height: 0; background: var(--panel); }
.lib, .set { min-height: 0; min-width: 0; }
.center { grid-area: center; display: flex; flex-direction: column; min-height: 0; }
.center > * { flex: 1; }
.right { grid-area: right; min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: 10px; border-left: 1px solid var(--line); overflow-y: auto; background: var(--panel); }

/* 리모컨(폰, 계정 없음): 모니터 + 슬라이드 목록 + 이동 버튼만. 화면 폭과 무관하게 1열 */
.control.remote {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: 'top' 'right' 'center';
}
.control.remote .top { flex-wrap: wrap; gap: 8px; }
.control.remote .group { flex: 1; }
.control.remote .group button { flex: 1; padding: 10px 12px; }
.control.remote .right { border-left: 0; border-bottom: 1px solid var(--line); overflow: visible; padding: 8px 12px; gap: 0; }
.control.remote .right :deep(.monitors) { max-width: 520px; width: 100%; margin: 0 auto; }
.control.remote .right :deep(.screen) { max-height: 32dvh; margin: 0 auto; }

.toast {
  position: fixed; left: 50%; top: 56px; transform: translateX(-50%); z-index: 20; max-width: 640px;
  padding: 10px 14px; border-radius: 8px; background: #2b3550; border: 1px solid var(--accent); cursor: pointer;
}
.help {
  position: fixed; right: 12px; top: 52px; z-index: 20; padding: 12px 16px; border-radius: 8px;
  background: var(--panel-2); border: 1px solid var(--line); font-size: 13px;
}
.help td:first-child { color: var(--accent); padding-right: 16px; white-space: nowrap; }

/* ── 모바일: 모니터 + 슬라이드 목록 한 줄 스크롤, 검색/콘티/설정은 바텀시트 ── */
.sheet-head, .dock, .backdrop { display: none; }

@media (max-width: 768px) {
  .control {
    height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    grid-template-areas: 'top' 'right' 'center' 'dock';
  }
  .desk-only { display: none !important; }

  .top { flex-wrap: wrap; gap: 8px; padding: 6px 10px; }
  .spacer { display: none; }
  .group { flex: 1; }
  .group button { flex: 1; padding: 9px 12px; }
  .mode { font-size: 12px; }

  .right { padding: 6px 10px; border-left: 0; border-bottom: 1px solid var(--line); overflow: visible; gap: 0; }
  .right :deep(.monitors) { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
  .right :deep(.screen) { width: min(100%, calc(30dvh * 16 / 9)); margin: 0 auto; }

  .backdrop { display: block; position: fixed; inset: 0; z-index: 25; background: rgba(0, 0, 0, .5); }

  .left, .style-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    height: min(78dvh, 640px); padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    background: var(--panel); border: 1px solid var(--line); border-bottom: 0; border-radius: 14px 14px 0 0;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, .5);
    transform: translateY(105%); visibility: hidden; transition: transform .2s, visibility 0s .2s;
  }
  .left.open, .style-sheet.open { transform: none; visibility: visible; transition: transform .2s; }
  .left { grid-template-rows: auto minmax(0, 1fr); gap: 8px; }
  .style-sheet { overflow-y: auto; }
  .left[data-tab='lib'] .set, .left[data-tab='set'] .lib { display: none; }

  .sheet-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .left .sheet-head { margin-bottom: 0; }
  .sheet-head .spacer { display: block; flex: 1; }
  .sheet-head button { padding: 8px 14px; }
  .sheet-head button.on { background: var(--accent); border-color: var(--accent); color: #fff; }

  .dock { grid-area: dock; display: flex; gap: 8px; padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); background: var(--panel); border-top: 1px solid var(--line); }
  .dock button { flex: 1; padding: 12px 6px; font-size: 13px; white-space: nowrap; }
}
</style>
