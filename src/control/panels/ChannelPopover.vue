<script setup lang="ts">
/**
 * 호스트 전용: 채널 번호·링크·QR, 관리(리모컨 쫓아내기 · 보기 비밀번호 · 채널 삭제).
 * 관리는 계정 권한이라 로그인이 필요하다. 이 PC(호스트)는 어느 관리를 해도 끊기지 않는다.
 */
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import * as api from '@/channel/api'
import { hostLink, hostNeedsLogin, hostDeleted, reconnectHost } from '@/channel/sync'
import { session } from '@/lib/auth'
import { forgetChannelLocal } from '@/live/persistence'
import { requireLogin } from '@/lib/loginPrompt'
import { useBackClose } from '@/lib/backClose'

const props = defineProps<{ code: string; title: string }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()
useBackClose(() => true, () => emit('close')) // 뒤로가기 = 닫기

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
  hostDeleted.value ? '이 채널은 서버에서 삭제되었습니다 — 폰·보기는 끊겼고 PC 송출은 계속됩니다' : hostNeedsLogin.value ? '이 PC 의 인터넷 송출 권한이 만료됐습니다(30일 미사용 등) — 아래 관리에서 로그인하면 다시 연결됩니다 (PC 송출은 정상)'
    : hostLink.value === 'live' ? '● 폰·보기 연결 준비됨'
      : hostLink.value === 'connecting' ? '연결 중…'
        : hostLink.value === 'error' ? '폰·보기 연결 안 됨 (송출은 정상) — 자동 재시도 중' : '',
)

// 관리 (로그인 필요). 호스트 PC 는 어느 쪽도 끊기지 않는다 — 바뀐 주소로 바로 다시 연결
const showManage = ref(false)
const newControl = ref('')
const newView = ref('')
const msg = ref<string | null>(null)
const busy = ref(false)

/** 리모컨 모두 쫓아내기 = 컨트롤 비밀번호 변경(새 비밀번호 필수) */
async function kick() {
  if (newControl.value.length < 4) { msg.value = '새 컨트롤 비밀번호를 4자 이상 입력하세요'; return }
  if (!confirm('컨트롤 비밀번호를 바꾸고 모든 리모컨을 쫓아냅니다.\n리모컨 폰은 다음 조작부터 막히고, 새 비밀번호로만 다시 들어올 수 있습니다.\n(이 PC 와 보기 기기는 그대로)')) return
  busy.value = true
  const err = await api.kickRemotes(props.code, newControl.value)
  busy.value = false
  if (err) { msg.value = err; return }
  newControl.value = ''
  msg.value = '리모컨을 모두 쫓아냈습니다. 새 컨트롤 비밀번호를 알려 주세요.'
  reconnectHost()
}

/** 보기 비밀번호 설정/변경, 또는 없애기(null) */
async function changeView(remove: boolean) {
  if (!remove && newView.value.length < 4) { msg.value = '새 보기 비밀번호를 4자 이상 입력하세요'; return }
  const q = remove
    ? '보기 비밀번호를 없앱니다. 채널 번호만 알면 누구나 볼 수 있게 됩니다.'
    : '보기 비밀번호를 바꿉니다. 보기 기기는 새 비밀번호를 입력해야 합니다.'
  if (!confirm(q)) return
  busy.value = true
  const err = await api.setViewPassword(props.code, remove ? null : newView.value)
  busy.value = false
  if (err) { msg.value = err; return }
  newView.value = ''
  msg.value = remove ? '보기 비밀번호를 없앴습니다.' : '보기 비밀번호를 바꿨습니다.'
  reconnectHost()
}

async function remove() {
  if (!confirm(`채널 "${props.title}" 을(를) 삭제할까요?\n폰·보기 연결이 모두 끊기고 되돌릴 수 없습니다.`)) return
  const err = await api.deleteChannel(props.code)
  if (err) { msg.value = err; return }
  forgetChannelLocal(props.code)
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
    <p class="muted center">QR/링크는 <b>보기용</b>입니다. 리모컨은 컨트롤 링크로 들어가 컨트롤 비밀번호를 입력합니다.</p>

    <div class="url">
      <input :value="viewUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
      <button @click="copy('view', viewUrl)">{{ copied === 'view' ? '복사됨' : '보기 링크' }}</button>
    </div>
    <div class="url">
      <input :value="controlUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
      <button @click="copy('control', controlUrl)">{{ copied === 'control' ? '복사됨' : '컨트롤 링크' }}</button>
    </div>
    <p class="muted"><b>다른 기기에서 빔(프로젝터)으로 띄우기</b>: 빔에 연결된 PC 에서 <b>보기 링크</b>를 열면 넓은 화면에선 송출 화면이 그대로 나옵니다(클릭하면 전체화면). 인터넷을 거치므로 끊기면 멈춥니다 — 이 기기가 빔에 연결돼 있다면 <b>출력 시작</b>이 더 안전합니다.</p>
    <p class="st" :class="hostNeedsLogin || hostDeleted ? 'error' : hostLink">{{ linkText }}</p>
    <p v-if="isLocal" class="warn">지금 주소가 localhost 라서 폰에서는 열리지 않습니다. 배포된 주소(Vercel)에서 여세요.</p>

    <button class="ghost" @click="showManage = !showManage">{{ showManage ? '▾' : '▸' }} 관리 (리모컨 쫓아내기 · 보기 비밀번호 · 삭제)</button>
    <template v-if="showManage">
      <button v-if="!session" class="primary" @click="requireLogin('관리 기능(리모컨 쫓아내기·보기 비밀번호·삭제)은 채널을 만든 계정으로 로그인해야 합니다.')">관리하려면 로그인</button>
      <template v-else>
        <div class="box">
          <b>리모컨 모두 쫓아내기</b>
          <small>컨트롤 비밀번호를 바꿉니다. 리모컨 폰은 다음 조작부터 막힙니다. 이 PC·보기 기기는 그대로.</small>
          <input v-model="newControl" type="password" placeholder="새 컨트롤 비밀번호 (필수, 4자 이상)" autocomplete="new-password" />
          <button :disabled="busy || newControl.length < 4" @click="kick">비밀번호 바꾸고 리모컨 쫓아내기</button>
        </div>
        <div class="box">
          <b>보기 비밀번호</b>
          <small>바꾸면 보기 기기는 새 비밀번호를 입력해야 합니다. 없애면 번호만으로 누구나 봅니다.</small>
          <input v-model="newView" type="password" placeholder="새 보기 비밀번호 (4자 이상)" autocomplete="new-password" />
          <div class="row2">
            <button :disabled="busy || newView.length < 4" @click="changeView(false)">설정·변경</button>
            <button :disabled="busy" @click="changeView(true)">없애기</button>
          </div>
        </div>
        <button class="danger" @click="remove">채널 삭제</button>
        <small class="muted">이 PC 를 잃어버렸다면 채널을 삭제하고 새로 만드세요.</small>
      </template>
    </template>
    <p v-if="msg" class="warn">{{ msg }}</p>
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
.x { border: none; background: none; padding: 2px 6px; box-shadow: none; margin: 0; }
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
.ghost { text-align: left; background: none; border: none; padding: 2px 0; color: var(--muted); font-size: 12px; box-shadow: none; margin: 0; }
.box { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; }
.box b { font-size: 13px; }
.box small { color: var(--muted); font-size: 11px; }
.row2 { display: flex; gap: 6px; }
.row2 button { flex: 1; }

@media (max-width: 768px) {
  .pop { top: auto; bottom: 0; left: 0; right: 0; width: auto; border-radius: 14px 14px 0 0; padding-bottom: calc(14px + env(safe-area-inset-bottom)); max-height: 85dvh; }
}
</style>
