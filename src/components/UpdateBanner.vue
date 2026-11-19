<script setup lang="ts">
/** 새 버전 알림. 송출 화면(/output, 넓은 화면의 /view)에는 절대 띄우지 않는다 */
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { needRefresh, applyUpdate } from '@/pwa'
import { onStage } from '@/lib/stage'

const route = useRoute()
const later = ref(false)
const show = computed(() => needRefresh.value && !later.value && !route.path.startsWith('/output') && !onStage.value)
</script>

<template>
  <div v-if="show" class="upd" role="status">
    <span>새 버전이 있습니다. <small>적용하면 이 창이 새로고침됩니다 — 송출 중이면 예배 후에 적용하세요.</small></span>
    <button class="primary" @click="applyUpdate">지금 적용</button>
    <button @click="later = true">나중에</button>
  </div>
</template>

<style scoped>
.upd {
  position: fixed; left: 12px; bottom: 12px; z-index: 50; max-width: min(520px, calc(100vw - 24px));
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; font-size: 13px;
  background: var(--panel-2); border: 1px solid var(--accent); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .5);
}
.upd span { flex: 1; min-width: 200px; }
.upd small { color: var(--muted); }
.upd button { font-size: 14px; white-space: nowrap; }
</style>
