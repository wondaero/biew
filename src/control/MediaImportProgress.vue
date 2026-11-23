<script setup lang="ts">
/** 그림 넣는 중(PDF 변환) 진행 창 — 열린 동안 송출 단축키 막음, 뒤로가기·Esc·[취소] = 취소 */
import { onMounted, onBeforeUnmount } from 'vue'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'

const props = defineProps<{ name: string; done: number; total: number }>()
const emit = defineEmits<{ cancel: [] }>()
usePauseHotkeys()
useBackClose(() => true, () => emit('cancel'))
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('cancel') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
void props
</script>

<template>
  <div class="mi-backdrop">
    <div class="mi-box" role="dialog" aria-label="그림 넣는 중">
      <b>그림 넣는 중…</b>
      <p class="name">{{ name }}</p>
      <progress :max="total || 1" :value="done" />
      <p class="cnt">{{ total ? `${done} / ${total}장` : '파일 여는 중' }}</p>
      <button @click="emit('cancel')">취소</button>
    </div>
  </div>
</template>

<style scoped>
.mi-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(0, 0, 0, .55); padding: 16px; }
.mi-box { display: grid; gap: 10px; width: min(360px, 100%); padding: 18px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); }
.name { margin: 0; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
progress { width: 100%; height: 10px; accent-color: var(--accent); }
.cnt { margin: 0; font-size: 13px; }
button { justify-self: end; font-size: 14px; }
</style>
