<script setup lang="ts">
/**
 * [🖼 PDF·그림] 버튼 — PDF(PowerPoint 에서 PDF 로 저장한 것) 또는 그림 파일들을 골라 선곡 맨 뒤에 그림 묶음으로 넣는다.
 * 변환·저장은 이 기기 안에서(src/media/media.ts). 호스트 전용.
 */
import { ref } from 'vue'
import { useLive } from '@/live/liveStore'
import { importFiles, MediaImportError } from '@/media/media'
import { MEDIA_SONG_ID } from '@shared/media'
import MediaImportProgress from './MediaImportProgress.vue'

withDefaults(defineProps<{ label?: string }>(), { label: '🖼 PDF·그림' })
const live = useLive()
const input = ref<HTMLInputElement>()
const job = ref<{ name: string; done: number; total: number; ctrl: AbortController } | null>(null)
const notice = ref<{ text: string; warn: boolean } | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
function say(text: string, warn = false) {
  notice.value = { text, warn }
  clearTimeout(timer)
  timer = setTimeout(() => (notice.value = null), warn ? 9000 : 4000)
}

async function onPick() {
  const files = [...(input.value?.files ?? [])]
  if (input.value) input.value.value = '' // 같은 파일을 다시 골라도 change 가 오게
  if (!files.length) return
  const ctrl = new AbortController()
  job.value = { name: files.length === 1 ? files[0]!.name : `${files[0]!.name} 외 ${files.length - 1}개`, done: 0, total: 0, ctrl }
  try {
    const r = await importFiles(files, (p) => { if (job.value?.ctrl === ctrl) { job.value.done = p.done; job.value.total = p.total } }, ctrl.signal)
    if (ctrl.signal.aborted) return
    live.setlist.add({ id: MEDIA_SONG_ID, title: r.title, slides: r.slides })
    say(`선곡 ${live.state.setlist.length}번째로 추가 — 그림 ${r.slides.length}장`)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return say('그림 넣기를 취소했습니다')
    say(e instanceof MediaImportError ? e.message : `그림을 넣지 못했습니다: ${e instanceof Error ? e.message : e}`, true)
  } finally {
    // 취소한 뒤 바로 새로 넣었으면 job 은 새 작업 — 그 창을 닫지 않는다
    if (job.value?.ctrl === ctrl) job.value = null
  }
}
function cancel() {
  job.value?.ctrl.abort()
  job.value = null
}
</script>

<template>
  <button class="mi-open" title="PDF 또는 그림(PNG·JPG)을 선곡에 추가 — PPT 는 PowerPoint 에서 PDF 로 저장해서" :disabled="!!job" @click="input?.click()">{{ label }}</button>
  <input ref="input" class="mi-file" type="file" multiple accept=".pdf,application/pdf,image/*,.ppt,.pptx" @change="onPick" />
  <MediaImportProgress v-if="job" :name="job.name" :done="job.done" :total="job.total" @cancel="cancel" />
  <Teleport to="body">
    <p v-if="notice" class="mi-notice" :class="{ warn: notice.warn }" role="status">{{ notice.text }}</p>
  </Teleport>
</template>

<style scoped>
.mi-file { display: none; }
.mi-notice {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 61; margin: 0; max-width: calc(100vw - 32px);
  padding: 8px 14px; border-radius: 8px; background: #1d2a22; border: 1px solid var(--live); color: #c9f5d9; font-size: 13px;
}
.mi-notice.warn { background: #2e2614; border-color: var(--warn); color: #ffe7a8; }
@media (max-width: 768px) { .mi-notice { bottom: 80px; } }
</style>
