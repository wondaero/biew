<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useLive } from '@/live/liveStore'
import { hostLink, hostNeedsLogin, hostDeleted, remoteLink } from '@/channel/sync'
import { forgetToken } from '@/channel/api'
import { LOCAL_CODE, forgetVisit } from '@/live/persistence'
import { loadCache, checkRemote, useLibrary } from '@/library/library'
import { openOutputWindow } from './outputWindow'
import { isMobileOS } from '@/lib/device'
import { useHotkeys } from './useHotkeys'
import { useBackClose } from '@/lib/backClose'
import SearchDialog from './SearchDialog.vue'
import SetlistPanel from './panels/SetlistPanel.vue'
import SlideGrid from './panels/SlideGrid.vue'
import MonitorPanel from './panels/MonitorPanel.vue'
import OnAirStrip from './OnAirStrip.vue'
import TransportBar from './TransportBar.vue'
import StylePanel from './panels/StylePanel.vue'
import StylePreview from './panels/StylePreview.vue'
import StyleDialog from './StyleDialog.vue'
import StyleSummary from './panels/StyleSummary.vue'
import { useStyleDraft } from '@/live/styleDraft'
import ChannelPopover from './panels/ChannelPopover.vue'
import SwitchToInternet from './SwitchToInternet.vue'

defineProps<{ title: string }>()
const router = useRouter()
const route = useRoute()
const live = useLive()
/** host = 이 PC(전체 기능) / remote = 폰 리모컨(이동·BLANK·점프만) */
const isHost = computed(() => live.role.value === 'host')
const code = computed(() => live.channelCode.value ?? '')
/** 오프라인 모드(/local): 채널이 없으니 📡·번호 표시 없음 */
const isLocalMode = computed(() => code.value === LOCAL_CODE)
/** 인터넷 송출 호스트의 서버 연결 문제 — PC 송출(출력 창)은 어느 경우에도 계속된다 */
const netWarn = computed(() => {
  if (!isHost.value || isLocalMode.value) return null
  if (hostDeleted.value) return '이 채널은 삭제되었습니다 — PC 송출(출력 창)은 계속, 폰·보기는 끊김. 계속 쓰려면 새 채널을 만드세요'
  if (hostNeedsLogin.value) return '인터넷 송출 권한 만료 — 📡 관리에서 로그인하세요 (PC 송출은 계속)'
  if (hostLink.value === 'error') return '인터넷 끊김 — PC 송출은 계속, 폰·보기는 멈춤 (다시 연결되면 PC 기준으로 맞춤)'
  return null
})
const link = computed(() => (isHost.value ? hostLink.value : remoteLink.value))
const gridRef = ref<InstanceType<typeof SlideGrid>>()
const lib = useLibrary()

/**
 * 곡 검색 = 팝업(SearchDialog, 사용자 결정 2026-11-18 — 메인은 핵심만). '/' 로 열고 검색칸에 바로 커서.
 * newSong: 사이드바 "+ 새 곡" — 같은 팝업을 열고 편집기를 바로 띄운다(저장하면 검색 결과에 보여 바로 Enter 로 추가).
 */
const showSearch = ref(false)
const searchNew = ref(false)
function openSearch(newSong = false) {
  if (!isHost.value) return
  searchNew.value = newSong
  showSearch.value = true
  sheet.value = null
}
useHotkeys(live, { focusSearch: () => openSearch() })

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
  // 폰·태블릿은 출력 창이 새 탭으로 열려 컨트롤러와 동시에 못 쓰고, HDMI 는 보통 미러링이라 가사만 내보낼 수 없다.
  // 판정이 틀릴 수 있으므로(DeX 등) 막지 않고 확인만
  if (isMobileOS() && !confirm(
    '이 기기(폰·태블릿)에서는 출력 창을 제대로 쓸 수 없을 가능성이 큽니다.\n'
    + '· 출력이 새 탭으로 열려 컨트롤러와 동시에 볼 수 없고, 뒤로 간 탭은 멈출 수 있습니다.\n'
    + '· 프로젝터에 연결해도 보통 이 화면 전체가 그대로 나옵니다(미러링).\n\n'
    + '송출은 PC 에서 하고, 폰·태블릿은 인터넷 송출의 리모컨으로 쓰는 것을 권합니다.\n그래도 출력 창을 열까요?',
  )) return
  const r = await openOutputWindow(code.value)
  say(r.message)
}

const showHelp = ref(false)
// 인터넷 송출로 막 전환했으면(?share=1) 📡 창을 바로 열어 폰이 QR·링크로 들어오게
const showChannel = ref(route.query.share === '1')
const showSwitch = ref(false)

/** 로컬 송출 종료: 선곡을 비우고(출력 설정 유지) 출력 창은 검은 화면으로 남긴다 — 다음 예배를 그대로 이어서 */
function endLocal() {
  if (!confirm('이 송출을 끝낼까요?\n선곡이 비워지고 출력 창은 검은 화면이 됩니다(창은 닫지 않음). 출력 설정은 유지됩니다.')) return
  live.actions.endSession()
}

/** 리모컨: 이 기기에 저장된 토큰을 지우고 나간다(다음엔 비밀번호를 다시 입력) */
function leaveRemote() {
  if (!confirm('이 기기에서 나갈까요? 다음에 들어올 때 비밀번호를 다시 입력해야 합니다.')) return
  forgetToken('control', code.value)
  forgetVisit(code.value, 'control')
  router.push('/')
}

// 모바일 바텀시트: 선곡(set)·출력 설정(style). 곡 검색은 PC·모바일 모두 팝업(SearchDialog)
const sheet = ref<'set' | 'style' | null>(null)
/** 출력 설정에 적용 안 된 수정본이 있으면 하단 버튼에 표시(시트를 닫아도 수정본은 남음) */
const styleDraft = useStyleDraft()
/** PC 출력 설정 팝업(모바일은 바텀시트 sheet === 'style') */
const showStyle = ref(false)
/**
 * 모바일 배치(≤768px, CSS 미디어쿼리와 같은 기준)면 출력 설정 = 바텀시트, 아니면 = 팝업. 둘 중 하나만 그린다
 * (예전엔 PC 에서도 숨긴 시트가 같이 그려져 설정 패널이 두 벌이었음).
 */
const narrowMq = window.matchMedia('(max-width: 768px)')
const narrow = ref(narrowMq.matches)
const onNarrow = () => { narrow.value = narrowMq.matches }
narrowMq.addEventListener('change', onNarrow)
onBeforeUnmount(() => narrowMq.removeEventListener('change', onNarrow))
// 뒤로가기 = 열린 바텀시트·단축키 도움말 닫기(페이지를 나가지 않게)
useBackClose(() => !!sheet.value, () => { sheet.value = null })
// 출력 설정 시트를 닫으면: 바로 적용 모드면 저장 안 한 변경을 버린다(송출 화면도 원래대로). 미리보기 모드는 수정본 유지
watch(sheet, (v, old) => { if (old === 'style' && v !== 'style') styleDraft.closed() })
useBackClose(() => showHelp.value, () => { showHelp.value = false })
function openSheet(kind: 'set' | 'style') { sheet.value = kind }
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
    // DB 와 비교만(숫자 배지). 받는 건 곡 목록의 [⬇ 다운로드]로. 처음 쓰는 기기(빈 상태)는 로그인돼 있으면 전체를 바로 받음
    loadCache().then(() => checkRemote())
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

      <!-- 송출 버튼: PC = 이 줄 안, 폰 = 화면 맨 아래 두 줄(아래 transport) — 둘 중 하나만 -->
      <TransportBar v-if="!narrow" :host="isHost" :stretch="!isHost" />

      <label v-if="isHost" class="mode" title="켜면 슬라이드를 누를 때 바로 나가지 않고 미리보기로 골라 둔 뒤, Enter 나 [송출] 버튼으로 내보냅니다">
        <input v-model="live.pvwMode.value" type="checkbox" /> 미리보기 후 송출
      </label>

      <span class="spacer" />

      <span v-if="netWarn" class="netwarn" role="status">{{ netWarn }}</span>
      <template v-if="isLocalMode">
        <button class="endlocal danger-line" title="선곡을 비우고 다음 예배 준비(출력 창은 검은 화면으로 유지)" @click="endLocal">송출 종료</button>
        <button class="tonet" title="지금 송출을 그대로 인터넷 송출로 옮겨 폰 리모컨·보기를 씀" @click="showSwitch = true">🌐<span class="net-word"> 인터넷 송출</span><span class="wide-word">로 전환</span></button>
      </template>
      <template v-if="isHost">
        <span class="conn desk-only" :class="{ on: outputOn }" :title="outputOn ? '출력 창 연결됨' : '출력 창 없음'"><span class="conn-word">{{ outputOn ? '출력 연결됨' : '출력 없음' }}</span></span>
        <button class="primary desk-only" @click="startOutput">출력 시작</button>
        <button v-if="!isLocalMode" class="share" :class="link" title="채널 번호 · QR · 접속 관리" @click="showChannel = !showChannel">📡 채널</button>
        <button class="desk-only quiet" title="단축키" @click="showHelp = !showHelp">?</button>
      </template>
      <template v-else>
        <span class="conn" :class="{ on: link === 'live' }">{{ link === 'live' ? '연결됨' : link === 'connecting' ? '연결 중…' : '연결 안 됨' }}</span>
        <button title="이 기기 잊기" @click="leaveRemote">나가기</button>
      </template>
    </header>

    <div v-if="toast" class="toast" @click="toast = null">{{ toast }}</div>
    <ChannelPopover v-if="isHost && !isLocalMode && showChannel" :code="code" :title="title" @close="showChannel = false" />
    <SwitchToInternet v-if="showSwitch" @close="showSwitch = false" />
    <StyleDialog v-if="isHost && showStyle && !narrow" @close="showStyle = false" />
    <div v-if="showHelp" class="help" @click="showHelp = false">
      <table>
        <tr><td>→ / Space</td><td>다음 슬라이드 (미리보기 후 송출 모드: 골라 둔 미리보기를 송출)</td></tr>
        <tr><td>←</td><td>이전 슬라이드</td></tr>
        <tr><td>↓ / ↑</td><td>다음 곡 첫 장 / 이전 곡(또는 현재 곡) 첫 장</td></tr>
        <tr><td>1 ~ 9, 0</td><td>현재 곡의 N번째 (0 = 10번째)</td></tr>
        <tr><td>B</td><td>블랭크 토글</td></tr>
        <tr><td>F</td><td>프리즈 걸기 (송출 화면 고정, 조작은 계속). 해제는 FREEZE 버튼을 직접 클릭</td></tr>
        <tr><td>Enter</td><td>미리보기 → 송출</td></tr>
        <tr><td>/</td><td>검색창으로</td></tr>
        <tr><td>Esc</td><td>입력창에서 빠져나오기</td></tr>
      </table>
    </div>

    <div v-if="sheet" class="sheet-backdrop" @click="sheet = null" />
    <SearchDialog v-if="isHost && showSearch" :start-new="searchNew" @close="showSearch = false" />

    <!--
      사이드바(PC 왼쪽, 사용자 결정 2026-11-18 — 메인은 핵심만, 자잘한 건 팝업):
      송출 화면 → 출력 설정 한 줄 → [곡 검색][+ 새 곡] → 선곡(남는 높이 전부).
      모바일: 송출 화면만 위에 보이고, 선곡은 바텀시트(sheet === 'set'), 곡 검색은 팝업, 버튼은 하단 도크.
    -->
    <aside class="side">
      <MonitorPanel @jump="gridRef?.scrollToLive()" />
      <template v-if="isHost">
        <StyleSummary v-if="!narrow" @open="showStyle = true" />
        <div class="side-actions desk-only">
          <button class="find" title="곡 목록 — 찾아서 [+ 선곡] 또는 Enter 로 추가 ( / )" @click="openSearch()">
            🔍 곡 목록 <kbd>/</kbd><b v-if="lib.remoteCount.value" class="badge down" title="DB 에서 바뀐 곡 — 다운로드로 받기">⬇{{ lib.remoteCount.value }}</b><b v-if="lib.pendingCount.value" class="badge" title="이 기기에서 바꾼 곡 — 업로드 대기">⬆{{ lib.pendingCount.value }}</b>
          </button>
          <button title="새 곡 등록(오프라인이면 PC 에 저장)" @click="openSearch(true)">+ 새 곡</button>
        </div>
        <p v-if="!narrow && !lib.count.value" class="side-hint">저장된 곡이 없습니다 — <b>곡 목록</b>에서 로그인해 곡을 받으세요.</p>
        <div class="set-wrap" :class="{ open: sheet === 'set' }">
          <div class="sheet-head">
            <b>선곡</b>
            <span class="spacer" />
            <button @click="openSearch()">🔍 곡 추가</button>
            <button aria-label="닫기" @click="sheet = null">✕</button>
          </div>
          <OnAirStrip class="sheet-strip" />
          <SetlistPanel class="set" @jump="onJump" />
        </div>
      </template>
    </aside>

    <main class="center">
      <SlideGrid ref="gridRef" />
    </main>

    <!-- 모바일 출력 설정 바텀시트(PC 는 StyleDialog 팝업). 둘 중 하나만 그린다 -->
    <div v-if="isHost && narrow" class="style-sheet" :class="{ open: sheet === 'style' }">
      <!-- 머리 + 미리보기를 시트 위에 고정, 설정은 그 아래에서 스크롤 -->
      <div class="sheet-top">
        <div class="sheet-head">
          <b>출력 설정</b>
          <span class="spacer" />
          <button aria-label="닫기" @click="sheet = null">✕</button>
        </div>
        <OnAirStrip class="sheet-strip" />
        <StylePreview class="sheet-pv" />
      </div>
      <StylePanel touch-guard />
    </div>

    <!-- 폰: 준비용 버튼(곡 목록·선곡·출력 설정)은 위, 송출 버튼은 맨 아래(사용자 결정 2026-11-19) -->
    <nav v-if="isHost" class="dock">
      <button @click="openSearch()">🔍 곡 목록<b v-if="lib.remoteCount.value" class="badge down">⬇{{ lib.remoteCount.value }}</b><b v-if="lib.pendingCount.value" class="badge">⬆{{ lib.pendingCount.value }}</b></button>
      <button @click="openSheet('set')">☰ 선곡 {{ live.state.setlist.length }}</button>
      <button :class="{ dirty: styleDraft.dirty.value }" @click="openSheet('style')">⚙ 출력 설정<i v-if="styleDraft.dirty.value" class="dock-dot" title="저장 안 된 변경 있음" /></button>
    </nav>
    <TransportBar v-if="narrow" class="transport" bottom :host="isHost" />
  </div>
</template>

<style scoped>
.control {
  height: 100vh;
  display: grid;
  /* minmax(0, …): 긴 제목/nowrap 텍스트가 열을 밀어내지 않도록 */
  /* 2단(사용자 결정 2026-11-18): 사이드바 320px(송출 화면 약 300px — 글자를 읽을 수 있는 크기) + 슬라이드 목록(나머지 전부) */
  grid-template-columns: 320px minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas: 'top top' 'side center';
  overflow: hidden;
}
.top { grid-area: top; display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { font-size: 15px; font-weight: 700; letter-spacing: .5px; background: none; border: none; padding: 0; box-shadow: none; margin: 0; }
.ch { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 13px; }
.ch b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 26ch; }
.ch code, .ch small { color: var(--muted); font-size: 12px; }
.netwarn { font-size: 12px; color: var(--warn); padding: 3px 8px; border: 1px solid #5a4a1e; border-radius: 6px; background: #3a3014; }
.share.live { border-color: var(--pvw); color: var(--pvw); }
.share.error { border-color: var(--pgm); }
/* 송출 조작 버튼(◀ ▶ BLANK FREEZE) 모양은 TransportBar.vue */
/* 위 버튼 줄: 글자는 꺾지 않고, PC 화면이 좁을수록 덜 중요한 글자부터 줄인다(1280px 에서 버튼 글자가 두 줄로 꺾였음) */
.top button, .mode, .conn { white-space: nowrap; }
@media (max-width: 1440px) {
  .ch small, .wide-word { display: none; }
}
@media (max-width: 1150px) {
  .conn-word { display: none; }
}
/* 769~1023px(세로 태블릿 등): 한 줄에 안 들어가면 두 줄로(잘리지 않게). 이 구간은 3단 배치 자체가 좁다 — 별도 과제 */
@media (max-width: 1023px) { .top { flex-wrap: wrap; row-gap: 6px; } }
.mode { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); cursor: pointer; }
.spacer { flex: 1; }
.conn { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.conn::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #555; }
.conn.on { color: var(--text); }
.conn.on::before { background: var(--pvw); box-shadow: 0 0 6px var(--pvw); }

.side { grid-area: side; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 10px; border-right: 1px solid var(--line); background: var(--panel); overflow: hidden; }
.side-actions { display: flex; gap: 6px; }
.side-actions button { padding: 8px 10px; }
.side-actions .find { flex: 1; }
kbd { margin-left: 4px; padding: 0 4px; font: 11px ui-monospace, monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; }
/* 서버에 올릴 곡 수(곡 검색 팝업 안에 올리기 버튼이 있음) */
.badge.down { background: rgba(79, 140, 255, .25); color: #dbe7ff; }
.badge { margin-left: 6px; padding: 0 6px; border-radius: 8px; font-size: 11px; font-weight: 600; background: #5a4a1e; color: #f5d27a; }
.side-hint { margin: 0; font-size: 12px; color: var(--warn); }
.side-hint b { color: var(--text); }
/* 선곡: 사이드바의 남는 높이 전부 */
.set-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-top: 10px; border-top: 1px solid var(--line); }
.set-wrap .set { flex: 1; min-height: 0; }
.center { grid-area: center; display: flex; flex-direction: column; min-height: 0; }
.center > * { flex: 1; }
.sheet-pv { display: none; }
.dirty { color: #dbe7ff; border-color: var(--preview); }
.dock-dot { display: inline-block; width: 7px; height: 7px; margin-left: 5px; border-radius: 50%; background: var(--preview); vertical-align: middle; }

/* 리모컨(계정 없음): 모니터 + 슬라이드 목록 + 이동 버튼만. 화면 폭과 무관하게 1열 */
.control.remote {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: 'top' 'side' 'center';
}
.control.remote .top { flex-wrap: wrap; gap: 8px; }
.control.remote .side { border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; padding: 8px 12px; gap: 0; }
.control.remote .side :deep(.monitors) { max-width: 520px; width: 100%; margin: 0 auto; }
.control.remote .side :deep(.screen) { max-height: 32dvh; margin: 0 auto; }

.toast {
  position: fixed; left: 50%; top: 56px; transform: translateX(-50%); z-index: 20; max-width: 640px;
  padding: 10px 14px; border-radius: 8px; background: #2b3550; border: 1px solid var(--accent); cursor: pointer;
}
.help {
  position: fixed; right: 12px; top: 52px; z-index: 20; padding: 12px 16px; border-radius: 8px;
  background: var(--panel-2); border: 1px solid var(--line); font-size: 13px;
}
.help td:first-child { color: var(--accent); padding-right: 16px; white-space: nowrap; }

/* ── 모바일: 모니터 + 슬라이드 목록 한 줄 스크롤, 검색/선곡/설정은 바텀시트 ── */
/* 이름 주의: scoped 스타일은 자식 컴포넌트의 최상위 요소에도 걸린다 — 자식 대화창(.backdrop)과 겹치지 않게 sheet- 접두사 */
.sheet-head, .dock, .sheet-backdrop { display: none; }

@media (max-width: 768px) {
  .control {
    height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    /* 위 = 관리(상단 바) → 준비(곡 목록·선곡·출력 설정) → 송출 화면 → 가사 목록, 맨 아래 = 송출 버튼 */
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    grid-template-areas: 'top' 'dock' 'side' 'center' 'transport';
  }
  .control.remote {
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    grid-template-areas: 'top' 'side' 'center' 'transport';
  }
  .transport { grid-area: transport; }
  .desk-only { display: none !important; }

  /* 상단 바: 1줄 = Biew · 채널 이름, 2줄 = [미리보기 후 송출][송출 종료][🌐 인터넷 송출 | 📡 채널] */
  .top { flex-wrap: wrap; gap: 6px 8px; padding: 6px 10px; }
  .ch { flex: 1 1 60%; }
  .spacer { display: none; }
  .mode { font-size: 12px; margin-right: auto; }
  /* 좁은 폰: 🌐 만(글자 빼고) — 세 개가 한 줄에 들어가게 */
  @media (max-width: 360px) { .net-word { display: none; } }

  /* 사이드바 = 위쪽 송출 화면 줄(선곡은 바텀시트로 빠짐) */
  .side { padding: 6px 10px; border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; gap: 0; }
  .side :deep(.monitors) { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
  .side :deep(.screen) { width: min(100%, calc(30dvh * 16 / 9)); margin: 0 auto; }

  .sheet-backdrop { display: block; position: fixed; inset: 0; z-index: 25; background: rgba(0, 0, 0, .5); }

  .set-wrap, .style-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    /* 전체 화면(사용자 결정 2026-11-19 — 92% 시트는 위 틈만 애매하게 남았다). 열고 닫을 땐 아래에서 올라옴 */
    top: 0; height: 100dvh;
    padding: calc(10px + env(safe-area-inset-top)) 12px calc(10px + env(safe-area-inset-bottom));
    background: var(--panel); border: 0; border-radius: 0;
    transform: translateY(105%); visibility: hidden; transition: transform .2s, visibility 0s .2s;
  }
  .set-wrap.open, .style-sheet.open { transform: none; visibility: visible; transition: transform .2s; }
  .set-wrap { gap: 8px; }
  .style-sheet { overflow-y: auto; padding-top: 0; }
  /* 시트 머리 + 미리보기 고정, 설정만 스크롤 */
  .style-sheet .sheet-top { position: sticky; top: 0; z-index: 2; margin: 0 -12px 10px; padding: calc(10px + env(safe-area-inset-top)) 12px 10px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .style-sheet .sheet-top .sheet-head { margin-bottom: 4px; }
  /* 송출 중 한 줄: 시트 가로 여백을 뚫고 끝까지 */
  .sheet-strip { margin: 0 -12px; }
  .style-sheet .sheet-strip { margin-bottom: 8px; }
  .sheet-pv { display: grid; }

  .sheet-head { display: flex; align-items: center; gap: 6px; }
  .sheet-head b { font-size: 15px; }
  .sheet-head .spacer { display: block; flex: 1; }
  .sheet-head button { padding: 8px 14px; margin-bottom: 0; }
  /* ✕ 는 다른 전체 화면 팝업과 같은 평평한 글자 버튼 */
  .sheet-head button[aria-label="닫기"] { border: none; background: none; box-shadow: none; color: var(--muted); font-size: 18px; padding: 6px 10px; }
  /* 시트 머리에 제목이 있으므로 설정 패널 안 제목은 숨김(적용 안 된 변경은 미리보기가 알려 줌) */
  .style-sheet :deep(.style > h2) { display: none; }
  /* 시트 안의 선곡 제목 줄은 머리와 겹치므로 숨김 */
  .set-wrap .set :deep(header h2) { display: none; }
  .set-wrap .set :deep(header) { justify-content: flex-end; }

  /* 준비용 버튼 줄(위). 예배 전에 한 번 맞추면 거의 안 쓰므로 송출 버튼보다 낮게 */
  .dock { grid-area: dock; display: flex; gap: 6px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .dock button { flex: 1; min-width: 0; padding: 8px 4px; font-size: 13px; white-space: nowrap; margin-bottom: var(--lift); }
}
</style>
