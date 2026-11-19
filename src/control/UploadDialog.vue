<script setup lang="ts">
/**
 * ⬆ 업로드(이 기기 → DB, 2026-11-19 사용자 결정 — DB 는 이 화면으로만 바뀐다). 들어오기 전에 비밀번호 재확인(여기선 다시 안 물음).
 * 열면 DB 와 비교한 뒤 이 기기 변경(새 곡·수정·삭제)마다 중복·충돌을 검사한다. 비교 기준은 지금 DB.
 *  - 문제 없는 항목: 체크박스(기본 선택) + 전체 선택
 *  - 중복/충돌 항목: 처리 방법을 직접 고름(기본 '보류' — 고르지 않으면 올리지 않음). 어디가 다른지 보기(SongDiffView)
 *  - 전체 업로드(DB 를 이 기기로 통째로 교체)는 보류 — 이 기기에 없는 다른 기기의 곡까지 지울 수 있어 위험
 */
import { ref, computed, onMounted } from 'vue'
import { session } from '@/lib/auth'
import { prepareUpload, uploadOne, isLocalNewId, type UploadItem, type UploadAction } from '@/library/library'
import { isClean } from '@/library/pending'
import { diffSongs, diffSummary } from '@shared/songDiff'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import OnAirStrip from './OnAirStrip.vue'
import SongDiffView from './SongDiffView.vue'

const emit = defineEmits<{ close: [] }>()

/** 'skip' = 보류(이번엔 안 올림, PC 에 그대로) */
type Choice = 'skip' | Exclude<UploadAction, 'overwrite'> | `overwrite:${string}`
interface Row { item: UploadItem; checked: boolean; choice: Choice; open: boolean; result?: { ok: boolean; msg: string } }

const rows = ref<Row[]>([])
const loading = ref(false)
const err = ref<string | null>(null)
const busy = ref(false)
// 뒤로가기 = 닫기. 올리는 중엔 닫지 않는다
useBackClose(() => true, () => { if (!busy.value) emit('close') })
const ran = ref(false)

async function load() {
  if (!session.value) return
  loading.value = true
  err.value = null
  const r = await prepareUpload()
  loading.value = false
  if (r.error) { err.value = r.error; return }
  rows.value = r.items.map((item) => ({
    item,
    checked: isClean(item),
    choice: isClean(item) ? defaultAction(item) : item.p.kind === 'delete' && item.conflict === 'deleted' ? 'delete' : 'skip',
    open: false,
  }))
}
const defaultAction = (i: UploadItem): Choice => (i.p.kind === 'new' ? 'add' : i.p.kind === 'delete' ? 'delete' : 'mine')
usePauseHotkeys()
onMounted(() => { void load() })

const clean = (r: Row) => isClean(r.item)
const cleanRows = computed(() => rows.value.filter((r) => clean(r) && !r.result?.ok))
const allChecked = computed(() => cleanRows.value.length > 0 && cleanRows.value.every((r) => r.checked))
function toggleAll() { const v = !allChecked.value; for (const r of cleanRows.value) r.checked = v }
/** 이번에 실제로 처리할 항목 */
const todo = computed(() => rows.value.filter((r) => !r.result?.ok && (clean(r) ? r.checked : r.choice !== 'skip')))

/** 중복 후보 중 서버 곡만 덮어쓰기 대상이 될 수 있다(PC 새 곡끼리는 안 됨) */
const overwriteTargets = (r: Row) => [...r.item.dup.sameLyrics, ...r.item.dup.sameTitle].filter((s) => !isLocalNewId(s.id))

async function run() {
  busy.value = true
  for (const r of todo.value) {
    const c = r.choice
    const [action, target] = c.startsWith('overwrite:') ? (['overwrite', c.slice('overwrite:'.length)] as const) : ([c as UploadAction, undefined] as const)
    try {
      await uploadOne(r.item, action, target)
      r.result = { ok: true, msg: action === 'discard' ? '이 기기 변경 버림' : action === 'delete' ? 'DB 에서 삭제' : '올림' }
    } catch (e) {
      r.result = { ok: false, msg: (e as Error).message }
    }
  }
  busy.value = false
  ran.value = true
}

const kindLabel = (r: Row) => (r.item.p.kind === 'new' ? '새 곡' : r.item.p.kind === 'delete' ? '삭제' : '수정')
const titles = (list: { title: string }[]) => list.map((s) => `"${s.title}"`).join(', ')
/** 비교 대상(DB 쪽): 수정·삭제면 지금 DB 버전, 새 곡이면 첫 번째 중복 후보 */
const compareWith = (r: Row) => r.item.server ?? r.item.dup.sameLyrics[0] ?? r.item.dup.sameTitle[0] ?? null
/** 수정 요약: 지금 DB(없으면 고치기 시작할 때 버전)와 내 것의 다른 곳 */
const editSummary = (r: Row) => {
  const a = r.item.server ?? r.item.p.base
  return a ? `다른 곳: ${diffSummary(diffSongs(a, r.item.p))}` : ''
}
</script>

<template>
  <div class="backdrop" @mousedown.self="emit('close')">
    <div class="dialog m-full" role="dialog" aria-modal="true">
      <header>
        <h2>⬆ 업로드</h2>
        <span class="spacer" />
        <button class="x" title="닫기" @click="emit('close')">✕</button>
      </header>
      <OnAirStrip />
      <div v-if="cleanRows.length" class="tools">
        <label class="chk"><input type="checkbox" :checked="allChecked" :disabled="busy" @change="toggleAll" /> 전체 선택</label>
        <small class="muted">이 기기 → DB · 문제 있는 곡은 아래에서 하나씩 고르세요</small>
      </div>

      <div class="body">
        <p v-if="!session" class="muted">로그인이 필요합니다.</p>
        <p v-else-if="loading" class="muted">DB 와 비교하는 중…</p>
        <p v-else-if="err" class="err">{{ err }}</p>
        <p v-else-if="!rows.length" class="muted">올릴 변경이 없습니다. 이 기기에서 곡을 고치거나 새로 만들면 여기에 쌓입니다.</p>

        <ul v-else class="rows">
          <li v-for="r in rows" :key="r.item.p.id" :class="{ problem: !clean(r), done: r.result?.ok }">
            <div class="line">
              <input v-if="clean(r)" v-model="r.checked" type="checkbox" :disabled="busy || r.result?.ok" />
              <span class="tag" :class="r.item.p.kind">{{ kindLabel(r) }}</span>
              <b class="t">{{ r.item.p.title }}</b>
              <small>{{ r.item.p.slides.length }}장</small>
              <span v-if="r.result" class="res" :class="{ ok: r.result.ok }">{{ r.result.ok ? '✔' : '✖' }} {{ r.result.msg }}</span>
            </div>

            <!-- 수정 요약(어디가 다른지) -->
            <p v-if="r.item.p.kind === 'edit'" class="sub">{{ editSummary(r) }}</p>
            <p v-else-if="r.item.p.kind === 'delete'" class="sub">이 기기에서 지운 곡 — 올리면 DB 에서도 삭제(다른 기기는 다운로드 때 지워짐)</p>

            <!-- 문제 설명 + 처리 방법 -->
            <template v-if="!clean(r)">
              <p v-if="r.item.dup.sameLyrics.length" class="warn">가사가 같은 곡이 있습니다: {{ titles(r.item.dup.sameLyrics) }}</p>
              <p v-if="r.item.dup.sameTitle.length" class="warn">제목이 같은 곡이 있습니다(가사는 다름): {{ titles(r.item.dup.sameTitle) }}</p>
              <p v-if="r.item.conflict === 'changed'" class="warn">내가 {{ r.item.p.kind === 'delete' ? '지운' : '고친' }} 뒤 DB 에서도 이 곡이 바뀌었습니다(다른 기기). 아래 "어디가 다른지"를 보고 고르세요.</p>
              <p v-if="r.item.conflict === 'deleted'" class="warn">DB 에서 이미 삭제된 곡입니다.</p>

              <select v-model="r.choice" :disabled="busy || r.result?.ok">
                <option value="skip">보류 — 이번엔 올리지 않음(이 기기에 그대로)</option>
                <template v-if="r.item.p.kind === 'new'">
                  <option value="add">새 곡으로 추가</option>
                  <option v-for="s in overwriteTargets(r)" :key="s.id" :value="`overwrite:${s.id}`">기존 "{{ s.title }}" 에 덮어쓰기</option>
                  <option value="discard">이 기기에서 버리기</option>
                </template>
                <template v-else-if="r.item.p.kind === 'delete'">
                  <option value="delete">{{ r.item.conflict === 'deleted' ? '정리(이미 DB 에서도 삭제됨)' : 'DB 에서도 삭제' }}</option>
                  <option value="discard">삭제 취소(DB 것 유지)</option>
                </template>
                <template v-else-if="r.item.conflict === 'changed'">
                  <option value="mine">내 것으로 DB 덮어쓰기</option>
                  <option value="discard">DB 것 유지(내 수정 버리기)</option>
                </template>
                <template v-else>
                  <option value="add">새 곡으로 다시 추가</option>
                  <option value="discard">이 기기에서 버리기</option>
                </template>
              </select>

            </template>
            <template v-if="compareWith(r) || r.item.p.kind === 'edit'">
              <button class="ghost" @click="r.open = !r.open">{{ r.open ? '▾ 접기' : '▸ 어디가 다른지 보기' }}</button>
              <SongDiffView v-if="r.open" :a="compareWith(r) ?? r.item.p.base" :b="r.item.p.kind === 'delete' ? null : r.item.p" a-label="DB" b-label="이 기기" />
            </template>
          </li>
        </ul>
      </div>

      <footer v-if="session && rows.length">
        <span class="muted">{{ ran ? '처리 결과를 확인하세요.' : `처리할 항목 ${todo.length}건` }}</span>
        <span class="spacer" />
        <button :disabled="busy" @click="emit('close')">{{ ran ? '닫기' : '취소' }}</button>
        <button class="primary" :disabled="busy || !todo.length" @click="run">{{ busy ? '올리는 중…' : `선택한 ${todo.length}건 처리` }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .6); display: grid; place-items: center; padding: 16px; }
.dialog { width: min(760px, 100%); max-height: calc(100dvh - 32px); display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
header, footer { display: flex; align-items: center; gap: 10px; padding: 12px 16px; }
header { border-bottom: 1px solid var(--line); }
footer { border-top: 1px solid var(--line); }
h2 { margin: 0; font-size: 16px; }
.spacer { flex: 1; }
.x { border: none; background: none; box-shadow: none; margin: 0; }
.body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: grid; gap: 10px; align-content: start; }
.muted { margin: 0; color: var(--muted); font-size: 13px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.rows li { display: grid; gap: 6px; padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; }
.rows li.problem { border-color: #5a4a1e; }
.rows li.done { opacity: .6; }
.line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #3a3a46; color: #ddd; white-space: nowrap; }
.tag.new { background: #1e3a5f; }
.t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line small { color: var(--muted); white-space: nowrap; }
.res { margin-left: auto; font-size: 12px; color: var(--pgm); white-space: nowrap; }
.res.ok { color: var(--pvw); }
.sub { margin: 0; font-size: 12px; color: var(--muted); }
.warn { margin: 0; font-size: 12px; color: var(--warn); }
select { width: 100%; }
.ghost { justify-self: start; background: none; border: none; padding: 0; color: var(--accent); font-size: 13px; box-shadow: none; margin: 0; }
.tools { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.chk { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.tag.delete { background: #5a2a2a; }
</style>
