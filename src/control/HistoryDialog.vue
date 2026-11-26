<script setup lang="ts">
/**
 * 선곡 기록(예배 기록) 창 — 규칙: src/live/history.ts · shared/history.ts.
 *  - 2026-11-26 사용자 결정: 문서 프로그램처럼
 *    · 위: "지금 선곡 = 「기록 이름」"(불러왔거나 저장한 기록, 저장 안 된 변경이 있으면 표시) + [저장](그 기록에 덮어쓰기) ·
 *      이름 입력 + [다른 이름으로 저장](새 기록). 연결된 기록이 없으면 [저장]도 새로 저장.
 *    · 지난 날짜 기록에 [저장]하면 확인(지난주 기록을 이번 주 선곡으로 잃지 않게).
 *    · 목록: 항목을 누르면 곡 목록이 펼쳐지고 [불러오기]. [이름] [삭제].
 *    · 불러오기 = 그 기록을 복사해 지금 선곡으로(송출 대기) + 그 기록에 연결. 지금 선곡이 저장 안 됐으면 확인창에 알림.
 *  - 자동 기록은 없음(2026-11-26).
 *  - PC = 가운데 창, 폰 = 전체 화면(입력칸이 있는 팝업 규칙, src/style.css m-full). 뒤로가기·Esc = 닫기, 열린 동안 송출 단축키 막음.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { SetlistItem } from '@shared/types'
import type { HistoryRow } from '@shared/history'
import { HISTORY_TITLE_MAX, overwritesPast } from '@shared/history'
import { isMediaItem } from '@shared/media'
import { realCount } from '@shared/endSlide'
import { useLive } from '@/live/liveStore'
import { LOCAL_CODE } from '@/live/persistence'
import {
  saveAsHistory, overwriteHistory, listHistoryRows, getHistorySetlist, loadHistory, renameHistory, deleteHistory,
  historyTitleFor, flushPending, getLink, setLink, unsavedNow, type SaveResult,
} from '@/live/history'
import { useBackClose } from '@/lib/backClose'
import { resolveChanges } from './setlistChanges'
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

/** 지금 선곡과 연결된 기록 · 저장 안 된 변경 */
const link = computed(() => getLink(props.code))
const unsaved = computed(() => unsavedNow(props.code, live.state.setlist))
const hasSetlist = computed(() => live.state.setlist.length > 0)

async function reload() {
  loading.value = true
  if (!local.value) await flushPending(props.code) // 인터넷이 돌아왔으면 보관해 둔 것부터 올린다
  const r = await listHistoryRows(props.code)
  rows.value = r.rows
  error.value = r.error ?? null
  loading.value = false
  // 연결된 기록이 (다른 PC 에서) 지워졌으면 연결을 푼다 — 목록을 제대로 받았을 때만
  const l = getLink(props.code)
  if (l && !r.error && !r.rows.some((x) => x.id === l.id)) setLink(props.code, null)
}

const SAVED: Record<SaveResult, { text: string; warn?: boolean }> = {
  ok: { text: '저장했습니다' },
  pending: { text: '인터넷이 끊겨 이 PC 에 보관했습니다 — 다시 연결되면 서버에 올립니다', warn: true },
  empty: { text: local.value ? '선곡이 비어 있어 저장할 것이 없습니다' : '저장할 곡이 없습니다(그림 슬라이드는 서버 기록에 넣지 않음)', warn: true },
  error: { text: '저장하지 못했습니다', warn: true },
  offline: { text: '인터넷이 끊겨 덮어쓰지 못했습니다 — [다른 이름으로 저장]은 이 PC 에 보관했다가 올립니다', warn: true },
  missing: { text: '그 기록이 없어졌습니다(다른 곳에서 지움) — [다른 이름으로 저장]으로 새로 남기세요', warn: true },
}

/** [저장]: 연결된 기록에 덮어쓰기(지난 날짜면 확인). 연결이 없으면 새로 */
async function save() {
  if (busy.value) return
  const l = link.value
  if (!l) return saveAs()
  if (overwritesPast(l) && !confirm(`"${l.title}" (${day(l.savedAt)}) 기록을 지금 선곡으로 덮어씁니다.\n지난 기록은 바뀝니다. 새로 남기려면 [다른 이름으로 저장]을 누르세요.\n\n덮어쓸까요?`)) return
  busy.value = true
  const r = await overwriteHistory(props.code, live.state.setlist)
  busy.value = false
  msg.value = r === 'ok' ? { text: `"${l.title}" 에 저장했습니다` } : SAVED[r]
  if (r === 'ok' || r === 'pending' || r === 'missing') await reload()
}

/** [다른 이름으로 저장]: 새 기록(같은 내용이어도) → 이후 [저장]은 이 기록에 */
async function saveAs() {
  if (busy.value) return
  busy.value = true
  const r = await saveAsHistory(props.code, name.value, live.state.setlist)
  busy.value = false
  msg.value = SAVED[r]
  if (r === 'ok' || r === 'pending') await reload()
}

// ── 펼쳐 보기 ──
const open = ref<string | null>(null)
const detail = ref<{ id: string; setlist: SetlistItem[] | null } | null>(null)
async function toggle(row: HistoryRow) {
  if (open.value === row.id) { open.value = null; return }
  open.value = row.id
  if (detail.value?.id === row.id && detail.value.setlist) return
  detail.value = { id: row.id, setlist: null }
  const s = await getHistorySetlist(props.code, row)
  if (open.value === row.id) detail.value = { id: row.id, setlist: s ?? [] }
  if (!s) msg.value = { text: '그 기록을 불러오지 못했습니다(인터넷 또는 권한을 확인하세요)', warn: true }
}

/** [불러오기]: 지금 선곡을 그 기록으로(송출 대기) + 그 기록에 연결 */
async function load(row: HistoryRow) {
  if (busy.value) return
  const note = row.skippedMedia ? `\n그림 ${row.skippedMedia}묶음은 기록에 없어 빠집니다(다시 넣어야 함).` : ''
  const warn = unsavedNow(props.code, live.state.setlist) ? '\n\n⚠ 지금 선곡은 기록에 저장되지 않았습니다 — 필요하면 [취소] 후 먼저 저장하세요.' : ''
  if (!confirm(`"${row.title}" 을(를) 불러올까요?\n지금 선곡을 바꾸고 송출 화면은 대기(빈 화면)가 됩니다.\n이후 [저장]은 이 기록에 덮어씁니다.${note}${warn}`)) return
  // 오늘 고친 곡이 있으면 [저장하고][버리고][취소] — 곡 원본 저장은 따로 물어야 함
  const ch = await resolveChanges()
  if (!ch.go) { if (ch.note) msg.value = ch.note; return }
  busy.value = true
  try {
    const items = await loadHistory(props.code, row, detail.value?.id === row.id ? detail.value.setlist : null)
    if (!items) { msg.value = { text: '그 기록을 불러오지 못했습니다(인터넷 또는 권한을 확인하세요)', warn: true }; return }
    live.setlist.startFrom(items)
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
  const linked = link.value?.id === row.id ? '\n지금 선곡과 연결된 기록입니다 — 지우면 다음 [저장]은 새 기록이 됩니다.' : ''
  if (!confirm(`기록 "${row.title}" 을(를) 지울까요? 되돌릴 수 없습니다.${linked}`)) return
  if (!(await deleteHistory(props.code, row))) { msg.value = { text: '지우지 못했습니다', warn: true }; return }
  if (open.value === row.id) open.value = null
  await reload()
}

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })

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
        <!-- 지금 선곡: 연결된 기록 + [저장] -->
        <div class="cur">
          <div class="cur-info">
            <span class="lbl">지금 선곡</span>
            <b v-if="link" class="cur-t">「{{ link.title }}」</b>
            <span v-else class="cur-t none">{{ hasSetlist ? '아직 저장 안 함' : '비어 있음' }}</span>
            <span v-if="link && unsaved" class="dirty">• 저장 안 된 변경</span>
            <span v-else-if="link" class="clean">저장됨</span>
          </div>
          <button class="primary save-btn" :disabled="busy || !hasSetlist" :title="link ? `「${link.title}」 에 덮어쓰기` : '새 기록으로 저장(아래 이름)'" @click="save">저장</button>
        </div>
        <form class="save" @submit.prevent="saveAs">
          <input v-model="name" :maxlength="HISTORY_TITLE_MAX" placeholder="기록 이름 (예: 11/24 주일 2부)" aria-label="기록 이름" />
          <button class="save-as" :disabled="busy || !hasSetlist" title="이 이름으로 새 기록 — 이후 [저장]은 이 기록에">다른 이름으로 저장</button>
        </form>
        <p v-if="msg" class="msg" :class="{ warn: msg.warn }">{{ msg.text }}</p>
        <p v-if="error" class="msg warn">{{ error }}</p>

        <p v-if="loading" class="muted">불러오는 중…</p>
        <p v-else-if="!rows.length" class="muted empty">아직 기록이 없습니다. 선곡을 다 짠 뒤 [저장]을 누르면 여기에 남습니다.</p>
        <ul v-else class="list">
          <li v-for="r in rows" :key="r.id" :class="{ linked: link?.id === r.id, open: open === r.id }">
            <div class="head">
              <button class="info" :aria-expanded="open === r.id" title="눌러서 곡 목록 보기" @click="toggle(r)">
                <span class="t"><svg class="chev" :class="{ open: open === r.id }" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 9 6 4 9.5Z" fill="currentColor" /></svg>{{ r.title }}<span v-if="link?.id === r.id" class="now">지금 선곡</span></span>
                <span class="d">{{ when(r.savedAt) }} · {{ r.songs }}곡</span>
                <span v-if="r.skippedMedia || r.pending" class="tags">
                  <span v-if="r.skippedMedia" class="tag" title="서버 기록엔 그림 슬라이드를 넣지 않습니다">그림 {{ r.skippedMedia }}묶음 빠짐</span>
                  <span v-if="r.pending" class="tag warn" title="인터넷이 끊겨 아직 서버에 못 올림 — 다시 연결되면 올립니다">이 PC 에 보관 중</span>
                </span>
              </button>
              <div class="acts">
                <button :disabled="busy" @click="rename(r)">이름</button>
                <button class="danger-line" :disabled="busy" @click="remove(r)">삭제</button>
              </div>
            </div>
            <div v-if="open === r.id" class="detail">
              <p v-if="detail?.id !== r.id || !detail.setlist" class="muted">곡 목록 불러오는 중…</p>
              <ol v-else class="songs">
                <li v-for="(it, i) in detail.setlist" :key="i"><span class="no">{{ i + 1 }}</span><span class="st">{{ isMediaItem(it) ? '🖼 ' : '' }}{{ it.title }}</span><span class="n">{{ realCount(it.slides) }}장</span></li>
              </ol>
              <div class="load-row">
                <button class="primary" :disabled="busy || !detail?.setlist?.length" title="이 기록을 지금 선곡으로 — 이후 [저장]은 이 기록에 덮어씀" @click="load(r)">불러오기</button>
              </div>
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
.cur { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
.cur-info { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.lbl { font-size: 12px; color: var(--muted); }
.cur-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cur-t.none { color: var(--muted); font-size: 13px; }
.dirty { font-size: 12px; color: var(--preview); font-weight: 600; }
.clean { font-size: 12px; color: var(--muted); }
.save-btn { min-width: 84px; }
.save { display: flex; gap: 6px; }
.save input { flex: 1; min-width: 0; }
.save button { white-space: nowrap; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.empty { padding: 16px 0; text-align: center; }
.msg { margin: 0; font-size: 13px; color: var(--live); }
.msg.warn { color: var(--warn); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list > li { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; }
.list > li.linked { border-color: var(--preview-soft); }
.head { display: flex; gap: 10px; align-items: center; padding: 6px 10px 6px 4px; }
/* 항목 = 누르는 곳(펼치기). 버튼이지만 3D 받침 없이 평평하게 */
.info {
  flex: 1; min-width: 0; display: grid; gap: 2px; text-align: left; padding: 4px 6px; margin: 0;
  border: none; background: none; box-shadow: none; font: inherit; color: inherit; cursor: pointer; border-radius: 6px;
}
.info:hover { background: rgba(255, 255, 255, .04); }
.info:active { transform: none; }
.t { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 2px; color: var(--muted); transition: transform .15s; }
.chev.open { transform: rotate(90deg); }
.now { margin-left: 6px; padding: 0 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(79, 140, 255, .2); color: #dbe7ff; }
.d { font-size: 12px; color: var(--muted); padding-left: 14px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; padding-left: 14px; }
.tag { font-size: 11px; padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; color: var(--muted); }
.tag.warn { color: var(--warn); border-color: var(--warn); }
.acts { display: flex; gap: 6px; flex: none; }
.acts button { font-size: 14px; padding: 6px 10px; white-space: nowrap; }
.detail { display: grid; gap: 8px; padding: 0 12px 10px 24px; }
.songs { list-style: none; margin: 0; padding: 6px 0 0; border-top: 1px solid var(--line); display: grid; gap: 2px; }
.songs li { display: flex; gap: 8px; align-items: baseline; font-size: 13px; }
.songs .no { width: 18px; text-align: right; color: var(--muted); font-size: 12px; flex: none; }
.songs .st { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.songs .n { color: var(--muted); font-size: 12px; flex: none; }
.load-row { display: flex; justify-content: flex-end; }
/* 폰: 전체 화면, 항목은 버튼 줄을 아래로 */
@media (max-width: 768px) {
  .head { flex-direction: column; align-items: stretch; gap: 6px; padding: 6px 8px; }
  .acts button { flex: 1; min-width: 0; }
  .save { flex-wrap: wrap; }
  .save button { flex: 1 1 100%; }
  .detail { padding: 0 10px 10px; }
  .load-row button { flex: 1; }
}
</style>
