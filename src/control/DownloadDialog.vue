<script setup lang="ts">
/**
 * ⬇ 다운로드(DB → 이 기기, 2026-11-19 사용자 결정). 들어오기 전에 비밀번호 재확인을 거친다(여기선 다시 안 물음).
 * 열면 DB 와 이 기기를 통째로 비교한 목록(새 곡·수정·삭제 + 어디가 다른지) → 골라 받기.
 *  - 이 기기에서도 바꾼 곡(충돌)은 기본 선택 안 함 — 받으면 이 기기 변경이 사라지므로 한 번 더 묻는다.
 *  - [전체 받기] = 이 기기의 곡·바꾼 내용을 모두 지우고 DB 데이터로 교체(확인창).
 *  - 받지 않은 항목은 다음에 다시 나온다(통째로 비교하므로).
 */
import { ref, computed, onMounted } from 'vue'
import { checkRemote, applyDownload, downloadAll, remoteItems, syncStatus, syncError, pending, type RemoteItem } from '@/library/library'
import { pendingAsSong } from '@/library/pending'
import { diffSongs, diffSummary } from '@shared/songDiff'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import OnAirStrip from './OnAirStrip.vue'
import SongDiffView from './SongDiffView.vue'

const emit = defineEmits<{ close: [] }>()
const busy = ref(false)
const loading = ref(true)
const done = ref<string | null>(null)
const checked = ref<Set<string>>(new Set())
const open = ref<Set<string>>(new Set())
useBackClose(() => true, () => { if (!busy.value) emit('close') })
usePauseHotkeys()

onMounted(async () => {
  await checkRemote()
  loading.value = false
  checked.value = new Set(remoteItems.value.filter((r) => !r.mine).map((r) => r.id))
})

const items = computed(() => remoteItems.value)
/** 이 기기에 지금 보이는 버전(이 기기 변경이 있으면 그것) */
const mineView = (r: RemoteItem) => (r.mine ? (r.mine.kind === 'delete' ? null : pendingAsSong(r.mine)) : r.local)
const label = (r: RemoteItem) => (r.kind === 'new' ? '새 곡' : r.kind === 'deleted' ? '삭제' : '수정')
const title = (r: RemoteItem) => r.db?.title ?? r.local?.title ?? r.mine?.title ?? '(제목 없음)'
const summary = (r: RemoteItem) => {
  if (r.kind === 'new') return `DB 에 새 곡 · ${r.db?.slides.length ?? 0}장`
  if (r.kind === 'deleted') return 'DB 에서 삭제됨 — 받으면 이 기기에서도 지움'
  const a = mineView(r), b = r.db
  return a && b ? `다른 곳: ${diffSummary(diffSongs(a, b))}` : ''
}
const allChecked = computed(() => items.value.length > 0 && items.value.every((r) => checked.value.has(r.id)))
function toggleAll() { checked.value = allChecked.value ? new Set() : new Set(items.value.map((r) => r.id)) }
function flip(set: typeof checked, id: string) { const s = new Set(set.value); if (!s.delete(id)) s.add(id); set.value = s }
const toggleChecked = (id: string) => flip(checked, id)
const toggleOpen = (id: string) => flip(open, id)
const picked = computed(() => items.value.filter((r) => checked.value.has(r.id)))

async function run() {
  const lose = picked.value.filter((r) => r.mine)
  if (lose.length && !confirm(`이 기기에서 바꾼 ${lose.length}곡은 DB 버전으로 바뀌고, 이 기기 변경은 사라집니다.\n계속할까요?`)) return
  busy.value = true
  const n = picked.value.length
  try { await applyDownload(picked.value.map((r) => r.id)); done.value = `${n}곡 받았습니다.` } catch (e) { done.value = `받기 실패: ${(e as Error).message}` }
  busy.value = false
}
async function all() {
  const n = pending.value.length
  if (!confirm(`이 기기에 저장된 곡을 모두 지우고 DB 데이터로 바꿀까요?${n ? `\n업로드하지 않은 이 기기 변경 ${n}개도 사라집니다.` : ''}`)) return
  busy.value = true
  try { await downloadAll(); done.value = '전체를 DB 데이터로 바꿨습니다.' } catch (e) { done.value = `받기 실패: ${(e as Error).message}` }
  busy.value = false
}
</script>

<template>
  <div class="backdrop" @mousedown.self="!busy && emit('close')">
    <div class="dialog m-full" role="dialog" aria-modal="true" aria-label="다운로드">
      <header>
        <div class="row">
          <h2>⬇ 다운로드</h2>
          <button class="x" title="닫기" :disabled="busy" @click="emit('close')">✕</button>
        </div>
        <small class="sub">DB → 이 기기 · DB 와 다른 곡만 골라 받기</small>
      </header>
      <OnAirStrip />

      <div class="tools">
        <label v-if="items.length" class="chk"><input type="checkbox" :checked="allChecked" :disabled="busy" @change="toggleAll" /> 전체 선택</label>
        <span class="spacer" />
        <button class="danger-line" :disabled="busy || loading" title="이 기기의 곡을 모두 지우고 DB 데이터로 교체" @click="all">전체 받기</button>
      </div>

      <div class="body">
        <p v-if="loading || syncStatus === 'downloading'" class="muted">DB 와 비교하는 중…</p>
        <p v-else-if="syncStatus === 'error'" class="err">비교 실패: {{ syncError }}</p>
        <p v-else-if="syncStatus === 'offline'" class="err">인터넷 연결이 없습니다.</p>
        <p v-else-if="!items.length" class="muted">DB 와 같습니다. 받을 것이 없습니다.</p>
        <p v-if="done" class="done" role="status">✓ {{ done }}</p>
        <ul v-if="!loading && items.length" class="rows">
          <li v-for="r in items" :key="r.id" :class="{ conflict: !!r.mine }">
            <div class="line">
              <input type="checkbox" :checked="checked.has(r.id)" :disabled="busy" @change="toggleChecked(r.id)" />
              <span class="tag" :class="r.kind">{{ label(r) }}</span>
              <b class="t">{{ title(r) }}</b>
            </div>
            <p class="sum">{{ summary(r) }}</p>
            <p v-if="r.mine" class="warn">⚠ 이 기기에서도 {{ r.mine.kind === 'delete' ? '지운' : '고친' }} 곡 — 받으면 이 기기 변경은 사라집니다(안 받으면 업로드 때 다시 비교)</p>
            <button class="more" @click="toggleOpen(r.id)">{{ open.has(r.id) ? '▾ 접기' : '▸ 어디가 다른지 보기' }}</button>
            <SongDiffView v-if="open.has(r.id)" :a="r.kind === 'new' ? null : mineView(r)" :b="r.db" a-label="이 기기" b-label="DB" />
          </li>
        </ul>
      </div>

      <footer>
        <span class="muted">{{ picked.length }}곡 선택</span>
        <span class="spacer" />
        <button :disabled="busy" @click="emit('close')">닫기</button>
        <button class="primary" :disabled="busy || !picked.length" @click="run">{{ busy ? '받는 중…' : `다운로드 ${picked.length}` }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .6); display: grid; place-items: center; padding: 16px; }
.dialog { width: min(760px, 100%); height: min(820px, calc(100dvh - 32px)); display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
header { display: flex; flex-direction: column; gap: 2px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
header .row { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 16px; }
.sub { color: var(--muted); font-size: 12px; }
.x { border: none; background: none; box-shadow: none; margin: 0; color: var(--muted); font-size: 16px; }
.tools { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--line); }
.chk { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.spacer { flex: 1; }
.body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; display: grid; gap: 10px; align-content: start; }
.muted { margin: 0; color: var(--muted); font-size: 13px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.done { margin: 0; color: var(--live); font-size: 13px; font-weight: 600; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.rows li { display: grid; gap: 6px; padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
.rows li.conflict { border-color: #5a4a1e; }
.line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.line input { width: 18px; height: 18px; flex: none; }
.tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #3a3a46; color: #ddd; white-space: nowrap; }
.tag.new { background: #1e3a5f; }
.tag.deleted { background: #5a2a2a; }
.t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sum { margin: 0; font-size: 12px; color: var(--muted); }
.warn { margin: 0; font-size: 12px; color: var(--warn); }
.more { justify-self: start; background: none; border: none; padding: 0; color: var(--accent); font-size: 13px; box-shadow: none; margin: 0; }
footer { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--line); }
footer button { white-space: nowrap; }
</style>
