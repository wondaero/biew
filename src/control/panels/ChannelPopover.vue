<script setup lang="ts">
/** 호스트 전용: 채널 번호·링크·QR, 접속 끊기/비밀번호 변경, 채널 삭제 */
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import * as api from '@/channel/api'
import { hostLink, reconnectHost } from '@/channel/sync'
import { clearChannelLocal } from '@/live/persistence'

const props = defineProps<{ code: string; title: string }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()

const viewUrl = computed(() => `${location.origin}/view/${props.code}`)
const controlUrl = computed(() => `${location.origin}/control/${props.code}`)
const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname)
const qr = ref<string | null>(null)
watch(viewUrl, async (u) => { qr.value = await QRCode.toDataURL(u, { margin: 1, width: 200 }) }, { immediate: true })

const copied = ref<string | null>(null)
async function copy(label: string, text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = label; setTimeout(() => (copied.value = null), 1500) } catch { /* ignore */ }
}

const linkText = computed(() =>
  hostLink.value === 'live' ? '● 폰 연결 준비됨' : hostLink.value === 'connecting' ? '연결 중…' : hostLink.value === 'error' ? '폰 연결 안 됨 (송출은 정상) — 자동 재시도 중' : '',
)

// 접속 끊기 / 비밀번호 변경
const showReset = ref(false)
const newControl = ref('')
const newView = ref('')
const removeView = ref(false)
const msg = ref<string | null>(null)
const busy = ref(false)
async function reset() {
  if (!confirm('모든 기기의 접속을 끊습니다. 폰은 비밀번호를 다시 입력해야 합니다. 계속할까요?')) return
  busy.value = true
  const err = await api.resetAccess(props.code, { controlPassword: newControl.value, viewPassword: newView.value, removeViewPassword: removeView.value })
  busy.value = false
  if (err) { msg.value = err; return }
  newControl.value = ''; newView.value = ''; removeView.value = false
  msg.value = '모든 기기의 접속을 끊었습니다.'
  reconnectHost() // topic 이 새로 발급됨
}

async function remove() {
  if (!confirm(`채널 "${props.title}" 을(를) 삭제할까요?\n이 채널의 콘티와 모든 접속이 사라지고 되돌릴 수 없습니다.`)) return
  const err = await api.deleteChannel(props.code)
  if (err) { msg.value = err; return }
  clearChannelLocal(props.code)
  router.push('/')
}
</script>

<template>
  <div class="pop" @click.stop>
    <header>
      <h3>{{ title }}</h3>
      <button class="x" @click="emit('close')">✕</button>
    </header>

    <div class="code">{{ code }}</div>
    <img v-if="qr" :src="qr" alt="QR" class="qr" />
    <p class="muted center">QR/링크는 <b>보기용</b>입니다. 리모컨은 아래 컨트롤 링크로 들어가 컨트롤 비밀번호를 입력합니다.</p>

    <div class="url">
      <input :value="viewUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
      <button @click="copy('view', viewUrl)">{{ copied === 'view' ? '복사됨' : '보기 링크' }}</button>
    </div>
    <div class="url">
      <input :value="controlUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
      <button @click="copy('control', controlUrl)">{{ copied === 'control' ? '복사됨' : '컨트롤 링크' }}</button>
    </div>
    <p class="st" :class="hostLink">{{ linkText }}</p>
    <p v-if="isLocal" class="warn">지금 주소가 localhost 라서 폰에서는 열리지 않습니다. 배포된 주소(Vercel)에서 여세요.</p>

    <button class="ghost" @click="showReset = !showReset">{{ showReset ? '▾' : '▸' }} 접속 끊기 · 비밀번호 변경</button>
    <div v-if="showReset" class="reset">
      <input v-model="newControl" type="password" placeholder="새 컨트롤 비밀번호 (비우면 유지)" autocomplete="new-password" />
      <input v-model="newView" type="password" placeholder="새 보기 비밀번호 (비우면 유지)" autocomplete="new-password" :disabled="removeView" />
      <label class="check"><input v-model="removeView" type="checkbox" /> 보기 비밀번호 없애기(누구나 번호로 보기)</label>
      <button :disabled="busy" @click="reset">모든 기기 접속 끊기</button>
    </div>
    <p v-if="msg" class="warn">{{ msg }}</p>

    <button class="danger" @click="remove">채널 삭제</button>
  </div>
</template>

<style scoped>
.pop {
  position: fixed; right: 12px; top: 52px; z-index: 30; width: 320px; max-height: calc(100dvh - 64px); overflow-y: auto; padding: 14px;
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.5);
  display: grid; gap: 10px;
}
header { display: flex; align-items: center; }
h3 { margin: 0; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { border: none; background: none; padding: 2px 6px; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.center { text-align: center; }
.code { text-align: center; font: 700 28px/1 ui-monospace, monospace; letter-spacing: 4px; }
.qr { justify-self: center; border-radius: 6px; background: #fff; }
.url { display: flex; gap: 6px; }
.url input { flex: 1; min-width: 0; font-size: 12px; }
.st { margin: 0; font-size: 12px; color: var(--muted); }
.st.live { color: var(--pvw); }
.st.error { color: var(--warn); }
.warn { margin: 0; font-size: 12px; color: var(--warn); }
.ghost { text-align: left; background: none; border: none; padding: 2px 0; color: var(--muted); font-size: 12px; }
.reset { display: grid; gap: 6px; }
.check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
@media (max-width: 768px) {
  .pop { top: auto; bottom: 0; left: 0; right: 0; width: auto; border-radius: 14px 14px 0 0; padding-bottom: calc(14px + env(safe-area-inset-bottom)); max-height: 85dvh; }
}
</style>
