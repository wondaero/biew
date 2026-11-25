<script setup lang="ts">
/**
 * 선곡 기록(예배 기록) 창 — 2026-11-25 사용자 결정. 규칙: src/live/history.ts · shared/history.ts.
 *  - [지금 선곡 기록으로 저장](이름 = 날짜 + 채널 제목, 고칠 수 있음)
 *  - 목록: 이름 · 저장 시각 · 곡 수 · (그림 빠짐 / 이 PC 에 보관 중) · [복사해서 시작] [이름] [삭제]
 *  - 복사해서 시작 = 지금 선곡을 먼저 기록해 두고(잃지 않게), 그 기록을 복사해 새 선곡으로. 송출은 BLANK 로 시작.
 *  - PC = 가운데 창, 폰 = 전체 화면(입력칸이 있는 팝업 규칙, src/style.css m-full). 뒤로가기·Esc = 닫기, 열린 동안 송출 단축키 막음.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { HistoryRow } from '@shared/history'
import { HISTORY_TITLE_MAX } from '@shared/history'
import { useLive } from '@/live/liveStore'
import { LOCAL_CODE } from '@/live/persistence'
import { saveHistory, listHistoryRows, copyHistory, renameHistory, deleteHistory, historyTitleFor, flushPending } from '@/live/history'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import OnAirStrip from './OnAirStrip.vue'

const props = defineProps<{ code: string }>()
const emit = defineEmits<{ close: [] }>()
const live = useLive()
const local = computed(() => props.code === LOCAL_CODE)

const rows = ref<HistoryRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const msg = ref<{ text: string; warn?: boolean } | null>(null)
const busy = ref(false)
const name = ref(historyTitleFor(props.code))

async function reload() {
  loading.value = true
  if (!local.value) await flushPending(props.code) // 인터넷이 돌아왔으면 보관해 둔 것부터 올린다
  const r = await listHistoryRows(props.code)
  rows.value = r.rows
  error.value = r.error ?? null
  loading.value = false
}

const SAVED: Record<string, { text: string; warn?: boolean }> = {
  ok: { text: '기록했습니다' },
  dup: { text: '가장 최근 기록과 같은 선곡이라 다시 저장하지 않았습니다' },
  pending: { text: '인터넷이 끊겨 이 PC 에 보관했습니다 — 다시 연결되면 서버에 올립니다', warn: true },
  empty: { text: '선곡이 비어 있어 기록할 것이 없습니다', warn: true },
  error: { text: '기록하지 못했습니다', warn: true },
}
async function saveNow() {
  if (busy.value) return
  busy.value = true
  const r = await saveHistory(props.code, name.value, live.state.setlist)
  busy.value = false
  msg.value = SAVED[r]!
  if (r === 'ok' || r === 'pending') await reload()
}

async function start(row: HistoryRow) {
  if (busy.value) return
  const note = row.skippedMedia ? `\n그림 ${row.skippedMedia}묶음은 기록에 없어 빠집니다(다시 넣어야 함).` : ''
  if (!confirm(`"${row.title}" 을(를) 복사해서 새 선곡으로 시작할까요?\n지금 선곡은 먼저 기록해 둡니다. 송출 화면은 BLANK 가 됩니다.${note}`)) return
  busy.value = true
  try {
    const items = await copyHistory(props.code, row)
    if (!items) { msg.value = { text: '그 기록을 불러오지 못했습니다(인터넷 또는 권한을 확인하세요)', warn: true }; return }
    // 지금 선곡을 잃지 않게 먼저 기록(같은 내용이면 건너뜀). 실패해도 시작은 막지 않되 알린다
    const kept = live.state.setlist.length ? await saveHistory(props.code, historyTitleFor(props.code), live.state.setlist) : 'empty'
    live.setlist.startFrom(items)
    if (kept === 'error') { msg.value = { text: '시작했습니다 — 다만 직전 선곡을 기록하지 못했습니다', warn: true }; await reload(); return }
    emit('close')
  } finally {
    busy.value = false
  }
}

async function rename(row: HistoryRow) {
  const t = prompt('기록 이름', row.title)
  if (t === null || !t.trim() || t.trim() === row.title) return
  if (!(await renameHistory(props.code, row, t))) { msg.value = { text: '이름을 바꾸지 못했습니다', warn: true }; return }
  await reload()
}

async function remove(row: HistoryRow) {
  if (!confirm(`기록 "${row.title}" 을(를) 지울까요? 되돌릴 수 없습니다.`)) return
  if (!(await deleteHistory(props.code, row))) { msg.value = { text: '지우지 못했습니다', warn: true }; return }
  await reload()
}

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })

usePauseHotkeys()
useBackClose(() => true, () => emit('close'))
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); emit('close') } }
onMounted(() => { window.addEventListener('keydown', onKey); void reload() })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="hi-backdrop" @mousedown.self="emit('close')">
    <div class="hi m-full" role="dialog" aria-modal="true" aria-label="선곡 기록">
      <header>
        <div class="row">
          <h2>선곡 기록</h2>
          <button class="x" title="닫기 (Esc)" @click="emit('close')">✕</button>
        </div>
        <small class="where">{{ local ? '로컬 송출 — 이 PC 에만 저장' : '이 채널 — 서버에 저장(채널을 지우면 함께 지워짐, 그림 슬라이드는 빼고)' }}</small>
      </header>
      <OnAirStrip />
      <div class="body">
        <form class="save" @submit.prevent="saveNow">
          <input v-model="name" :maxlength="HISTORY_TITLE_MAX" placeholder="기록 이름 (예: 11/24 주일 2부)" aria-label="기록 이름" />
          <button class="primary" :disabled="busy || !live.state.setlist.length" :title="live.state.setlist.length ? '지금 선곡을 이 이름으로 기록' : '선곡이 비어 있음'">지금 선곡 기록</button>
        </form>
        <p class="hint">{{ local ? '[송출 종료] 때와, 다음 날 컨트롤러를 열 때 남아 있던 선곡도 자동으로 기록됩니다.' : '다음 예배에 이 채널을 열 때 지난 선곡이 자동으로 기록됩니다. 인터넷이 끊겨도 이 PC 에 보관했다가 올립니다.' }}</p>
        <p v-if="msg" class="msg" :class="{ warn: msg.warn }">{{ msg.text }}</p>
        <p v-if="error" class="msg warn">{{ error }}</p>

        <p v-if="loading" class="muted">불러오는 중…</p>
        <p v-else-if="!rows.length" class="muted empty">아직 기록이 없습니다.</p>
        <ul v-else class="list">
          <li v-for="r in rows" :key="r.id">
            <div class="info">
              <span class="t">{{ r.title }}</span>
              <span class="d">{{ when(r.savedAt) }} · {{ r.songs }}곡</span>
              <span v-if="r.skippedMedia || r.pending" class="tags">
                <span v-if="r.skippedMedia" class="tag" title="서버 기록엔 그림 슬라이드를 넣지 않습니다">그림 {{ r.skippedMedia }}묶음 빠짐</span>
                <span v-if="r.pending" class="tag warn" title="인터넷이 끊겨 아직 서버에 못 올림 — 다시 연결되면 올립니다">이 PC 에 보관 중</span>
              </span>
            </div>
            <div class="acts">
              <button class="primary" :disabled="busy" title="이 기록을 복사해 새 선곡으로 시작(지금 선곡은 먼저 기록)" @click="start(r)">복사해서 시작</button>
              <button :disabled="busy" @click="rename(r)">이름</button>
              <button class="danger-line" :disabled="busy" @click="remove(r)">삭제</button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hi-backdrop { position: fixed; inset: 0; z-index: 46; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.hi {
  width: min(620px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}
header { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
header .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
h2 { margin: 0; font-size: 16px; }
.where { color: var(--muted); font-size: 12px; }
.x { border: none; background: none; box-shadow: none; margin: 0; padding: 2px 8px; color: var(--muted); }
.body { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-content: start; padding: 12px 14px; }
.save { display: flex; gap: 6px; }
.save input { flex: 1; min-width: 0; }
.save button { white-space: nowrap; }
.hint, .muted { margin: 0; color: var(--muted); font-size: 12px; }
.empty { padding: 16px 0; text-align: center; }
.msg { margin: 0; font-size: 13px; color: var(--live); }
.msg.warn { color: var(--warn); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list li { display: flex; gap: 10px; align-items: center; padding: 8px 10px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; }
.info { flex: 1; min-width: 0; display: grid; gap: 2px; }
.t { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d { font-size: 12px; color: var(--muted); }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { font-size: 11px; padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; color: var(--muted); }
.tag.warn { color: var(--warn); border-color: var(--warn); }
.acts { display: flex; gap: 6px; flex: none; }
.acts button { font-size: 14px; padding: 6px 10px; white-space: nowrap; }
/* 폰: 전체 화면, 항목은 버튼 줄을 아래로 */
@media (max-width: 768px) {
  .list li { flex-direction: column; align-items: stretch; }
  .acts button { flex: 1; min-width: 0; }
  .save { flex-wrap: wrap; }
  .save button { flex: 1 1 100%; }
}
</style>
