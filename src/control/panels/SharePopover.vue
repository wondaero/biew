<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import QRCode from 'qrcode'
import { roomCodeRef, shareStatus, shareError, viewerUrl, startShare, stopShare, rotateShare } from '@/live/share'
import { session } from '@/lib/auth'

const emit = defineEmits<{ close: [] }>()
const qr = ref<string | null>(null)
const err = ref<string | null>(null)
const copied = ref(false)
const origin = location.origin
const isLocal = computed(() => /^(localhost|127\.|\[::1\])/.test(location.hostname))

watch(viewerUrl, async (u) => { qr.value = u ? await QRCode.toDataURL(u, { margin: 1, width: 220 }) : null }, { immediate: true })

async function start() { err.value = await startShare() }
async function rotate() { if (confirm('새 코드를 만들면 기존 링크로는 더 이상 볼 수 없습니다. 계속할까요?')) err.value = await rotateShare() }
async function stop() { if (confirm('폰 공유를 끝낼까요? 기존 링크가 닫힙니다.')) await stopShare() }
async function copy() {
  if (!viewerUrl.value) return
  try { await navigator.clipboard.writeText(viewerUrl.value); copied.value = true; setTimeout(() => (copied.value = false), 1500) } catch { /* ignore */ }
}
</script>

<template>
  <div class="pop" @click.stop>
    <header>
      <h3>폰으로 보기</h3>
      <button class="x" @click="emit('close')">✕</button>
    </header>

    <p v-if="!session" class="muted">로그인한 상태에서만 공유를 시작할 수 있습니다.</p>

    <template v-else-if="!roomCodeRef">
      <p class="muted">공유를 시작하면 방코드와 QR이 생깁니다. 링크를 가진 사람은 로그인 없이 <b>현재 콘티의 가사</b>를 실시간으로 볼 수 있습니다.</p>
      <button class="primary" @click="start">공유 시작</button>
    </template>

    <template v-else>
      <div class="code">{{ roomCodeRef }}</div>
      <img v-if="qr" :src="qr" alt="QR" class="qr" />
      <div class="url">
        <input :value="viewerUrl ?? ''" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button @click="copy">{{ copied ? '복사됨' : '복사' }}</button>
      </div>
      <p class="st" :class="shareStatus">
        {{ shareStatus === 'live' ? '● 실시간 전송 중' : shareStatus === 'connecting' ? '연결 중…' : shareStatus === 'error' ? `오류: ${shareError ?? '연결 실패'}` : '' }}
      </p>
      <p class="muted">링크 없이 들어가려면 다른 기기에서 <b>{{ origin }}/view</b> 에 접속해 위 코드를 입력하세요.</p>
      <p v-if="isLocal" class="warn">지금 주소가 localhost 라서 폰에서는 열리지 않습니다. 배포된 주소(Vercel)에서 공유를 시작하세요.</p>
      <div class="row">
        <button @click="rotate">새 코드</button>
        <button class="danger" @click="stop">공유 끝내기</button>
      </div>
    </template>
    <p v-if="err" class="warn">{{ err }}</p>
  </div>
</template>

<style scoped>
.pop {
  position: fixed; right: 12px; top: 52px; z-index: 30; width: 300px; padding: 14px;
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.5);
  display: grid; gap: 10px;
}
header { display: flex; align-items: center; }
h3 { margin: 0; font-size: 14px; flex: 1; }
.x { border: none; background: none; padding: 2px 6px; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.code { text-align: center; font: 700 28px/1 ui-monospace, monospace; letter-spacing: 4px; }
.qr { justify-self: center; border-radius: 6px; background: #fff; }
.url { display: flex; gap: 6px; }
.url input { flex: 1; min-width: 0; font-size: 12px; }
.st { margin: 0; font-size: 12px; color: var(--muted); }
.st.live { color: var(--pvw); }
.st.error { color: var(--pgm); }
.warn { margin: 0; font-size: 12px; color: var(--warn); }
.row { display: flex; gap: 6px; }
.row button { flex: 1; }
/* 모바일: 아래에서 올라오는 시트 모양 */
@media (max-width: 768px) {
  .pop { top: auto; bottom: 0; left: 0; right: 0; width: auto; border-radius: 14px 14px 0 0; padding-bottom: calc(14px + env(safe-area-inset-bottom)); max-height: 85dvh; overflow-y: auto; }
}
</style>
