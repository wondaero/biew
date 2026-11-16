<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useLive } from '@/live/liveStore'
import { loadCache, syncNow } from '@/library/library'
import { openOutputWindow } from './outputWindow'
import { useHotkeys } from './useHotkeys'
import LibraryPanel from './panels/LibraryPanel.vue'
import SetlistPanel from './panels/SetlistPanel.vue'
import SlideGrid from './panels/SlideGrid.vue'
import MonitorPanel from './panels/MonitorPanel.vue'
import StylePanel from './panels/StylePanel.vue'
import SharePopover from './panels/SharePopover.vue'
import { shareStatus } from '@/live/share'

const live = useLive()
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
  const r = await openOutputWindow()
  say(r.message)
}

const showHelp = ref(false)
const showShare = ref(false)

// 송출 중 실수로 컨트롤러를 닫는 것 방지(출력은 계속 유지되지만 조작 불가해짐)
const onBeforeUnload = (e: BeforeUnloadEvent) => { if (outputOn.value) e.preventDefault() }

onMounted(() => {
  document.title = '컨트롤러 — Biew'
  loadCache().then(() => syncNow())
  tick = window.setInterval(() => { now.value = Date.now() }, 1000)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  clearInterval(tick)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="control">
    <header class="top">
      <strong class="brand">Biew</strong>

      <div class="group">
        <button title="이전 (←)" @click="live.actions.prev()">◀</button>
        <button title="다음 (→ / Space)" @click="live.actions.next()">▶</button>
        <button class="blank" :class="{ on: live.state.blank }" title="자막 내리기 (B)" @click="live.actions.toggleBlank()">
          {{ live.state.blank ? 'BLANK 해제' : 'BLANK' }}
        </button>
      </div>

      <label class="mode" title="켜면 카드 클릭 = 미리보기, Enter/TAKE = 송출">
        <input v-model="live.pvwMode.value" type="checkbox" /> PVW/PGM 분리
      </label>

      <span class="spacer" />

      <span class="conn" :class="{ on: outputOn }">{{ outputOn ? '출력 연결됨' : '출력 없음' }}</span>
      <button class="primary" @click="startOutput">출력 시작</button>
      <button class="share" :class="shareStatus" title="폰으로 보기 (QR)" @click="showShare = !showShare">📱 폰</button>
      <button title="단축키" @click="showHelp = !showHelp">?</button>
    </header>

    <div v-if="toast" class="toast" @click="toast = null">{{ toast }}</div>
    <SharePopover v-if="showShare" @close="showShare = false" />
    <div v-if="showHelp" class="help" @click="showHelp = false">
      <table>
        <tr><td>→ / Space</td><td>다음 슬라이드 (PVW 모드: 미리보기 송출)</td></tr>
        <tr><td>←</td><td>이전 슬라이드</td></tr>
        <tr><td>↓ / ↑</td><td>다음 곡 첫 장 / 이전 곡(또는 현재 곡) 첫 장</td></tr>
        <tr><td>1 ~ 9, 0</td><td>현재 곡의 N번째 (0 = 10번째)</td></tr>
        <tr><td>B</td><td>블랭크 토글</td></tr>
        <tr><td>Enter</td><td>TAKE (미리보기 → 송출)</td></tr>
        <tr><td>/</td><td>검색창으로</td></tr>
        <tr><td>Esc</td><td>입력창에서 빠져나오기</td></tr>
      </table>
    </div>

    <aside class="left">
      <LibraryPanel ref="libRef" class="lib" />
      <SetlistPanel class="set" @jump="(i) => gridRef?.scrollToItem(i)" />
    </aside>

    <main class="center">
      <SlideGrid ref="gridRef" />
    </main>

    <aside class="right">
      <MonitorPanel />
      <StylePanel />
    </aside>
  </div>
</template>

<style scoped>
.control {
  height: 100vh;
  display: grid;
  grid-template-columns: 300px 1fr 400px;
  grid-template-rows: auto 1fr;
  grid-template-areas: 'top top top' 'left center right';
  overflow: hidden;
}
.top { grid-area: top; display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { font-size: 15px; letter-spacing: .5px; }
.share.live { border-color: var(--pvw); color: var(--pvw); }
.share.error { border-color: var(--pgm); }
.group { display: flex; gap: 4px; }
.blank.on { background: var(--warn); border-color: var(--warn); color: #222; font-weight: 700; }
.mode { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); cursor: pointer; }
.spacer { flex: 1; }
.conn { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.conn::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #555; }
.conn.on { color: var(--text); }
.conn.on::before { background: var(--pvw); box-shadow: 0 0 6px var(--pvw); }

.left { grid-area: left; display: grid; grid-template-rows: 1fr 1fr; gap: 12px; padding: 10px; border-right: 1px solid var(--line); min-height: 0; background: var(--panel); }
.lib, .set { min-height: 0; }
.center { grid-area: center; display: flex; flex-direction: column; min-height: 0; }
.center > * { flex: 1; }
.right { grid-area: right; display: flex; flex-direction: column; gap: 16px; padding: 10px; border-left: 1px solid var(--line); overflow-y: auto; background: var(--panel); }

.toast {
  position: fixed; left: 50%; top: 56px; transform: translateX(-50%); z-index: 20; max-width: 640px;
  padding: 10px 14px; border-radius: 8px; background: #2b3550; border: 1px solid var(--accent); cursor: pointer;
}
.help {
  position: fixed; right: 12px; top: 52px; z-index: 20; padding: 12px 16px; border-radius: 8px;
  background: var(--panel-2); border: 1px solid var(--line); font-size: 13px;
}
.help td:first-child { color: var(--accent); padding-right: 16px; white-space: nowrap; }
</style>
