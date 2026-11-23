<script setup lang="ts">
/**
 * 그림 슬라이드 한 장(shared/media.ts). 이 기기 IndexedDB 에서 꺼내 그린다 — 부모 크기 안에 비율 유지(contain).
 * 이 기기에 없으면(폰 리모컨·보기 — 1단계는 PC 에만 있음) 자리 표시.
 */
import { ref, watch } from 'vue'
import { mediaUrl } from '@/media/media'

const props = withDefaults(defineProps<{ id: string; compact?: boolean }>(), { compact: false })
/** undefined = 불러오는 중, null = 이 기기에 없음 */
const url = ref<string | null | undefined>(undefined)

watch(
  () => props.id,
  async (id) => {
    url.value = undefined
    const u = await mediaUrl(id)
    if (props.id === id) url.value = u
  },
  { immediate: true },
)
</script>

<template>
  <div class="media" :class="{ compact }">
    <img v-if="url" :src="url" alt="" draggable="false" />
    <span v-else-if="url === null" class="none">🖼 그림<template v-if="!compact"> — 이 기기에는 없음(PC 에서만 보임)</template></span>
  </div>
</template>

<style scoped>
.media { position: absolute; inset: 0; display: grid; place-items: center; background: #000; overflow: hidden; }
img { width: 100%; height: 100%; object-fit: contain; display: block; user-select: none; }
.none { color: #8a8a96; font-size: 4cqh; text-align: center; padding: 0 4cqw; }
.compact .none { font-size: 12px; }
</style>
