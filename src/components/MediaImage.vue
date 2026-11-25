<script setup lang="ts">
/**
 * 그림 슬라이드 한 장(shared/media.ts). 이 기기 IndexedDB → 없으면(인터넷 송출의 폰·다른 PC) 서버에서 받아 그린다
 * (src/media/media.ts mediaUrl). 부모 크기 안에 비율 유지(contain), 검정 바탕.
 * 아직 없으면(PC 가 올리는 중) 자리 표시 — 호스트의 알림(mediaTick)이 오거나 몇 초마다 다시 찾는다.
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { mediaUrl, mediaTick } from '@/media/media'
import { onStage } from '@/lib/stage'

const props = withDefaults(defineProps<{ id: string; compact?: boolean }>(), { compact: false })
/** undefined = 불러오는 중, null = 아직 없음 */
const url = ref<string | null | undefined>(undefined)
let retry: ReturnType<typeof setTimeout> | undefined
let alive = true

async function find() {
  clearTimeout(retry)
  const id = props.id
  const u = await mediaUrl(id)
  if (!alive || props.id !== id) return
  if (u || url.value !== u) url.value = u
  if (!u) retry = setTimeout(find, 5000)
}
watch(() => props.id, () => { url.value = undefined; void find() }, { immediate: true })
watch(mediaTick, () => { if (!url.value) void find() })
onBeforeUnmount(() => { alive = false; clearTimeout(retry) })
</script>

<template>
  <div class="media" :class="{ compact }">
    <img v-if="url" :src="url" alt="" draggable="false" />
    <!-- 송출 화면(출력 창·넓은 /view)엔 안내 문구를 절대 내보내지 않는다 — 검정만(CLAUDE.md: 송출 화면에 UI 금지) -->
    <span v-else-if="url === null && !onStage" class="none">🖼 그림<template v-if="!compact"> — 받는 중이거나 아직 없음</template></span>
  </div>
</template>

<style scoped>
.media { position: absolute; inset: 0; display: grid; place-items: center; background: #000; overflow: hidden; }
img { width: 100%; height: 100%; object-fit: contain; display: block; user-select: none; }
.none { color: #8a8a96; font-size: 4cqh; text-align: center; padding: 0 4cqw; }
.compact .none { font-size: 12px; }
</style>
