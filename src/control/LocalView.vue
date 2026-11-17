<script setup lang="ts">
/**
 * /local — 로컬 송출(오프라인 모드). 채널·서버 없이 이 PC 하나에서만 쓰는 송출 프로그램.
 * 컨트롤러 + 출력 창(/output/LOCAL, BroadcastChannel)만. 폰 리모컨·보기·로그인 불필요.
 * 곡은 미리 '곡 다운로드' 해 둔 것(IndexedDB)을 쓴다. 콘티는 이 PC 의 localStorage(biew.live.v1:LOCAL).
 * 컨트롤러는 한 창만: 같은 PC 에서 두 번째 창으로 열면 경고(Web Locks — 먼저 연 창이 닫히면 경고가 사라짐).
 */
import { ref, onBeforeUnmount } from 'vue'
import { openHost, closeChannel } from '@/live/liveStore'
import { LOCAL_CODE } from '@/live/persistence'
import ControlView from './ControlView.vue'

// ControlView 가 그려지기 전에 상태를 연다(setup 안에서 동기 호출)
openHost(LOCAL_CODE, { publish: () => {} })

// 한 PC 에 로컬 송출 컨트롤러는 하나. 두 창이어도 서로 같은 화면으로 맞춰져 사고는 없지만 헷갈리므로 경고
const duplicate = ref(false)
let release: (() => void) | null = null
const hold = () => new Promise<void>((r) => { release = r })
if (navigator.locks) {
  void navigator.locks.request('biew-local-controller', { ifAvailable: true }, async (lock) => {
    if (lock) return hold()
    duplicate.value = true
    // 먼저 연 창이 닫히면 이 창이 이어받는다
    void navigator.locks.request('biew-local-controller', async () => { duplicate.value = false; return hold() })
  })
}

onBeforeUnmount(() => {
  release?.()
  closeChannel()
})
</script>

<template>
  <div v-if="duplicate" class="dup" role="alert">
    이미 다른 창에서 로컬 송출 컨트롤러가 열려 있습니다. 두 창은 같은 화면으로 맞춰지지만 헷갈리지 않도록 <b>한 창만</b> 쓰세요.
  </div>
  <ControlView title="로컬 송출" />
</template>

<style scoped>
.dup {
  position: fixed; left: 50%; top: 56px; transform: translateX(-50%); z-index: 40; max-width: min(640px, calc(100vw - 24px));
  padding: 10px 14px; border-radius: 8px; font-size: 13px; background: #3a3014; border: 1px solid var(--warn); color: var(--warn);
}
</style>
