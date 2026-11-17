<script setup lang="ts">
/**
 * /local — 로컬 송출(오프라인 모드). 채널·서버 없이 이 PC 하나에서만 쓰는 송출 프로그램.
 * 컨트롤러 + 출력 창(/output/LOCAL, BroadcastChannel)만. 폰 리모컨·보기·로그인 불필요.
 * 곡은 미리 '곡 다운로드' 해 둔 것(IndexedDB)을 쓴다. 콘티는 이 PC 의 localStorage(biew.live.v1:LOCAL).
 */
import { onBeforeUnmount } from 'vue'
import { openHost, closeChannel } from '@/live/liveStore'
import { LOCAL_CODE } from '@/live/persistence'
import ControlView from './ControlView.vue'

// ControlView 가 그려지기 전에 상태를 연다(setup 안에서 동기 호출)
openHost(LOCAL_CODE, { publish: () => {} })
onBeforeUnmount(closeChannel)
</script>

<template>
  <ControlView title="로컬 송출" />
</template>
