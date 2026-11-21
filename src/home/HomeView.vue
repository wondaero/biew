<script setup lang="ts">
/**
 * 홈(/) — 화면 폭에 따라 배치만 고른다. 데이터·동작은 useHome 하나.
 *  - 넓은 PC(모바일 OS 아님 + 폭 1000px 이상): HomeDesk — 위쪽 막대 버튼 + 채널 카드 그리드(사용자 요청 2026-11-21)
 *  - 폰·태블릿·좁은 창: HomeMobile — 한 줄 카드(그대로)
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { isMobileOS } from '@/lib/device'
import HomeDesk from './HomeDesk.vue'
import HomeMobile from './HomeMobile.vue'

const mq = window.matchMedia('(min-width: 1000px)')
const desk = ref(!isMobileOS() && mq.matches)
const onChange = () => { desk.value = !isMobileOS() && mq.matches }
onMounted(() => mq.addEventListener('change', onChange))
onBeforeUnmount(() => mq.removeEventListener('change', onChange))
</script>

<template>
  <HomeDesk v-if="desk" />
  <HomeMobile v-else />
</template>
