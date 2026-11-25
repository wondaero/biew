<script setup lang="ts">
/**
 * 보기 전용 출력 화면. 상태를 그리기만 한다.
 * 복구 순서: localStorage 마지막 상태로 즉시 그림 → 컨트롤러에 request-state → 더 새 version 이 오면 반영.
 * 채널 갈아타기: 로컬 송출에서 인터넷 송출로 전환하면 컨트롤러가 'switch-channel' 을 보낸다 →
 *   화면은 그대로 둔 채(다시 그리지 않음) 새 채널의 BroadcastChannel 로 연결만 바꾼다(프로젝터 깜빡임 없음).
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import type { LiveState } from '@shared/types'
import { BroadcastChannelTransport } from '@/sync/BroadcastChannelTransport'
import { SyncHub } from '@/sync/SyncHub'
import { loadLive, loadHost, LOCAL_CODE } from '@/live/persistence'
import { onAir } from '@/live/nav'
import SlideRender from '@/components/SlideRender.vue'
import { useWakeLock } from './useWakeLock'
import { uid } from '@/lib/uid'
import { useStylePreview } from '@/live/stylePreview'
import { onStage } from '@/lib/stage'

import { setMediaSource } from '@/media/media'

// 채널별 출력: 같은 PC 의 해당 채널 컨트롤러와만 BroadcastChannel 로 연결된다(네트워크 불필요 → 인터넷이 끊겨도 동작)
let code = String(useRoute().params.code ?? '').toUpperCase()
const ID = `out-${uid().slice(0, 8)}`
/** 이 출력 창의 앱 버전 — 컨트롤러가 다르면 '출력 창 새로고침' 경고(옛 창은 그림 장을 글자로 송출함) */
const BUILD = __APP_BUILD__.commit
const state = ref<LiveState | null>(loadLive(code))
// 송출 화면 표시(그림 자리 안내 문구·새 버전 알림 등을 그리지 않게) — 첫 그림부터 적용되도록 setup 에서
onStage.value = true
// 출력 설정 '바로 적용' 중인 임시 설정(저장 전) — 있으면 이걸로 그린다(src/live/styleDraft.ts)
const preview = useStylePreview(() => state.value?.version)
let hub = connect(code)
/**
 * 그림 슬라이드: 이 PC 에 있는 그림으로 그린다(서버 불필요). 인터넷 송출 호스트 PC 인데 이 PC 에 없는 그림
 * (다른 PC 가 넣은 것)은 같은 PC 의 호스트 토큰으로 서버에서 받아 저장 — 컨트롤러도 같은 일을 하므로 어느 쪽이 먼저든 같다.
 */
function mediaSourceFor(c: string) {
  setMediaSource(c !== LOCAL_CODE && loadHost(c)?.token ? { code: c, kind: 'host', variant: 'full', persist: true } : null)
}
mediaSourceFor(code)
if (state.value) hub.mark(state.value)

function connect(c: string): SyncHub {
  return new SyncHub([new BroadcastChannelTransport(`biew-live:${c}`)], (s) => { state.value = s; preview.onState(s) }, (m) => {
    if (m.type === 'switch-channel' && m.code !== code) switchTo(m.code)
    else preview.onMessage(m)
  })
}
/** 화면은 그대로, 연결만 새 채널로(주소도 바꿔 두어 새로고침해도 새 채널로 복구) */
function switchTo(next: string) {
  hub.close()
  preview.clear() // 옛 채널의 임시 설정(바로 적용)은 끝
  code = next
  history.replaceState(history.state, '', `/output/${next}`)
  hub = connect(next)
  mediaSourceFor(next)
  hub.send({ type: 'request-state', from: ID })
  hub.send({ type: 'output-alive', from: ID, build: BUILD })
}

// FREEZE 중이면 고정된 화면(onAir)을 그린다 — 컨트롤러 조작이 출력에 새지 않게
const air = computed(() => (state.value ? onAir(state.value) : null))
const text = computed(() => air.value?.text ?? null)
const layerKey = computed(() => (air.value ? `${air.value.itemIndex}:${air.value.slideIndex}` : 0))

useWakeLock()

// 창이 가려지면 브라우저가 애니메이션 프레임을 멈춰 페이드가 끝나지 않을 수 있음 → 숨김 상태에선 컷
const visible = ref(document.visibilityState === 'visible')
const onVisibility = () => { visible.value = document.visibilityState === 'visible' }
document.addEventListener('visibilitychange', onVisibility)

// 전체화면: 브라우저 정책상 이 창 안에서의 사용자 입력이 필요
const isFullscreen = ref(!!document.fullscreenElement)
const hintVisible = ref(true)
function goFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
}
const onFs = () => { isFullscreen.value = !!document.fullscreenElement; if (isFullscreen.value) hintVisible.value = false }

let alive: number | undefined
let hintTimer: number | undefined
onMounted(() => {
  document.title = '출력 — Biew'
  document.documentElement.classList.add('is-output')
  document.addEventListener('fullscreenchange', onFs)
  hub.send({ type: 'request-state', from: ID })
  hub.send({ type: 'output-alive', from: ID, build: BUILD })
  alive = window.setInterval(() => hub.send({ type: 'output-alive', from: ID, build: BUILD }), 2000)
  // 안내 문구가 송출 화면에 오래 남지 않도록 자동 숨김
  hintTimer = window.setTimeout(() => { hintVisible.value = false }, 8000)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFs)
  document.removeEventListener('visibilitychange', onVisibility)
  clearInterval(alive); clearTimeout(hintTimer)
  document.documentElement.classList.remove('is-output')
  hub.close()
})
</script>

<template>
  <main class="output" @click="goFullscreen" @dblclick="goFullscreen">
    <SlideRender
      v-if="state"
      :text="text"
      :blank="air?.blank ?? false"
      :style-cfg="preview.style.value ?? state.style"
      :layer-key="layerKey"
      :animate="visible"
    />
    <div v-if="hintVisible && !isFullscreen" class="hint">클릭하면 전체화면 (또는 F11)</div>
  </main>
</template>

<style scoped>
.output { position: fixed; inset: 0; background: #000; cursor: none; user-select: none; }
.hint {
  position: absolute; top: 12px; left: 12px; padding: 6px 10px; border-radius: 6px;
  font: 13px system-ui, sans-serif; color: #aaa; background: rgba(40, 40, 40, .85);
}
</style>
