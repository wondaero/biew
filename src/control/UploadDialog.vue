<script setup lang="ts">
/**
 * 서버에 올리기: PC 에서 고치거나 새로 등록한 곡을 서버로.
 * 열면 서버 최신 곡을 먼저 받고(동기화), 항목마다 중복(새 곡)·충돌(수정)을 검사한다.
 *  - 문제 없는 항목: 체크박스(기본 선택)로 올릴지 고름
 *  - 중복/충돌 항목: 처리 방법을 직접 고름(기본 '보류' — 고르지 않으면 올리지 않음)
 * 로그인은 저장되지 않으므로 여기서 로그인한다.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { session } from '@/lib/auth'
import { prepareUpload, uploadOne, isLocalNewId, type UploadItem, type UploadAction } from '@/library/library'
import { isClean } from '@/library/pending'
import { useLive } from '@/live/liveStore'
import LoginForm from '@/components/LoginForm.vue'

const emit = defineEmits<{ close: [] }>()
const live = useLive()

/** 'skip' = 보류(이번엔 안 올림, PC 에 그대로) */
type Choice = 'skip' | Exclude<UploadAction, 'overwrite'> | `overwrite:${string}`
interface Row { item: UploadItem; checked: boolean; choice: Choice; open: boolean; result?: { ok: boolean; msg: string } }

const rows = ref<Row[]>([])
const loading = ref(false)
const err = ref<string | null>(null)
const busy = ref(false)
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
    choice: isClean(item) ? (item.p.kind === 'new' ? 'add' : 'mine') : 'skip',
    open: false,
  }))
}
watch(session, (s) => { if (s) void load() })
onMounted(() => { live.hotkeysPaused.value = true; void load() })
onBeforeUnmount(() => { live.hotkeysPaused.value = false })

const clean = (r: Row) => isClean(r.item)
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
      r.result = { ok: true, msg: action === 'discard' ? 'PC 변경 버림' : '올림' }
    } catch (e) {
      r.result = { ok: false, msg: (e as Error).message }
    }
  }
  busy.value = false
  ran.value = true
}

const kindLabel = (r: Row) => (r.item.p.kind === 'new' ? '새 곡' : '수정')
const titles = (list: { title: string }[]) => list.map((s) => `"${s.title}"`).join(', ')
const joinSlides = (slides: string[]) => slides.join('\n\n')
/** 비교 대상: 수정이면 서버 버전, 새 곡이면 첫 번째 중복 후보 */
const compareWith = (r: Row) => r.item.server ?? r.item.dup.sameLyrics[0] ?? r.item.dup.sameTitle[0] ?? null
</script>

<template>
  <div class="backdrop" @mousedown.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true">
      <header>
        <h2>서버에 올리기</h2>
        <span class="spacer" />
        <button class="x" title="닫기" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <LoginForm v-if="!session" hint="서버에 올리려면 로그인하세요. (로그인은 저장되지 않습니다)" />
        <p v-else-if="loading" class="muted">서버의 최신 곡을 받고 비교하는 중…</p>
        <p v-else-if="err" class="err">{{ err }}</p>
        <p v-else-if="!rows.length" class="muted">올릴 변경이 없습니다.</p>

        <ul v-else class="rows">
          <li v-for="r in rows" :key="r.item.p.id" :class="{ problem: !clean(r), done: r.result?.ok }">
            <div class="line">
              <input v-if="clean(r)" v-model="r.checked" type="checkbox" :disabled="busy || r.result?.ok" />
              <span class="tag" :class="r.item.p.kind">{{ kindLabel(r) }}</span>
              <b class="t">{{ r.item.p.title }}</b>
              <small>{{ r.item.p.slides.length }}장</small>
              <span v-if="r.result" class="res" :class="{ ok: r.result.ok }">{{ r.result.ok ? '✔' : '✖' }} {{ r.result.msg }}</span>
            </div>

            <!-- 수정 요약 -->
            <p v-if="r.item.p.kind === 'edit' && r.item.p.base" class="sub">
              <template v-if="r.item.p.base.title !== r.item.p.title">제목 "{{ r.item.p.base.title }}" → "{{ r.item.p.title }}" · </template>
              슬라이드 {{ r.item.p.base.slides.length }}장 → {{ r.item.p.slides.length }}장
            </p>

            <!-- 문제 설명 + 처리 방법 -->
            <template v-if="!clean(r)">
              <p v-if="r.item.dup.sameLyrics.length" class="warn">가사가 같은 곡이 있습니다: {{ titles(r.item.dup.sameLyrics) }}</p>
              <p v-if="r.item.dup.sameTitle.length" class="warn">제목이 같은 곡이 있습니다(가사는 다름): {{ titles(r.item.dup.sameTitle) }}</p>
              <p v-if="r.item.conflict === 'changed'" class="warn">내가 고치는 동안 서버에서도 이 곡이 바뀌었습니다. 서버 버전: "{{ r.item.server?.title }}" {{ r.item.server?.slides.length }}장</p>
              <p v-if="r.item.conflict === 'deleted'" class="warn">서버에서 삭제된 곡입니다.</p>

              <select v-model="r.choice" :disabled="busy || r.result?.ok">
                <option value="skip">보류 — 이번엔 올리지 않음(PC 에 그대로)</option>
                <template v-if="r.item.p.kind === 'new'">
                  <option value="add">새 곡으로 추가</option>
                  <option v-for="s in overwriteTargets(r)" :key="s.id" :value="`overwrite:${s.id}`">기존 "{{ s.title }}" 에 덮어쓰기</option>
                  <option value="discard">PC 에서 버리기</option>
                </template>
                <template v-else-if="r.item.conflict === 'changed'">
                  <option value="mine">내 것으로 덮어쓰기</option>
                  <option value="discard">서버 것 유지(내 수정 버리기)</option>
                </template>
                <template v-else>
                  <option value="add">새 곡으로 다시 추가</option>
                  <option value="discard">PC 에서 버리기</option>
                </template>
              </select>

              <button v-if="compareWith(r)" class="ghost" @click="r.open = !r.open">{{ r.open ? '▾' : '▸' }} 가사 비교</button>
              <div v-if="r.open && compareWith(r)" class="cmp">
                <div><h4>PC (내 것)</h4><pre>{{ joinSlides(r.item.p.slides) }}</pre></div>
                <div><h4>서버 "{{ compareWith(r)!.title }}"</h4><pre>{{ joinSlides(compareWith(r)!.slides) }}</pre></div>
              </div>
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
.x { border: none; background: none; }
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
.ghost { justify-self: start; background: none; border: none; padding: 0; color: var(--muted); font-size: 12px; }
.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cmp h4 { margin: 0 0 4px; font-size: 12px; color: var(--muted); font-weight: normal; }
.cmp pre { margin: 0; max-height: 240px; overflow: auto; white-space: pre-wrap; font: 12px/1.5 system-ui, 'Malgun Gothic', sans-serif; background: var(--bg); padding: 8px; border-radius: 6px; }
</style>
