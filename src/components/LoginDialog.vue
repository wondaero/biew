<script setup lang="ts">
/**
 * 공용 로그인 팝업(src/lib/loginPrompt.ts). App.vue 에 하나만 둔다.
 * PC = 화면 가운데 작은 창, 모바일(≤768px) = 아래에서 올라오는 시트. 다른 팝업(📡 관리·서버 올리기 등) 위에 겹쳐 뜬다.
 * Esc·뒤로가기·바깥 누르기 = 취소(요청한 쪽에 false). 로그인되면 요청한 쪽이 하려던 동작을 이어서 한다.
 */
import { computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { loginRequest, cancelLogin, loginSucceeded } from '@/lib/loginPrompt'
import { session } from '@/lib/auth'
import { LOGIN_DOMAIN } from '@shared/loginId'
import { useBackClose } from '@/lib/backClose'
import LoginForm from './LoginForm.vue'
import { useLive } from '@/live/liveStore'
import OnAirStrip from '@/control/OnAirStrip.vue'

useBackClose(() => true, cancelLogin)
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelLogin() } }
// 캡처 단계에서 받아 아래 팝업(출력 설정 등)의 Esc 처리보다 먼저 — 로그인 팝업만 닫히게
// 열린 동안 송출 단축키 막기. 닫을 때는 '열기 전 상태'로 — 출력 설정 팝업 위에 떴다 닫혀도 단축키가 다시 켜지지 않게
const live = useLive()
/** 비밀번호 재확인: 지금 계정 아이디를 채워 둔다(우리 도메인이면 아이디만) */
const reauth = computed(() => !!loginRequest.value?.reauth && !!session.value)
const presetId = computed(() => {
  const e = session.value?.user.email ?? ''
  return e.endsWith('@' + LOGIN_DOMAIN) ? e.slice(0, -(LOGIN_DOMAIN.length + 1)) : e
})
const pausedBefore = live.hotkeysPaused.value
onMounted(() => {
  live.hotkeysPaused.value = true
  window.addEventListener('keydown', onKey, true)
  if (!reauth.value) void nextTick(() => document.querySelector<HTMLInputElement>('.login-dlg input')?.focus()) // 아이디 칸에 바로 입력(재확인은 LoginForm 이 비밀번호 칸에)
})
onBeforeUnmount(() => {
  live.hotkeysPaused.value = pausedBefore
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <div class="login-backdrop" @mousedown.self="cancelLogin">
    <div class="login-dlg m-full" role="dialog" aria-modal="true" :aria-label="reauth ? '비밀번호 확인' : '로그인'">
      <header>
        <h2>{{ reauth ? '비밀번호 확인' : '로그인' }}</h2>
        <button class="x" title="닫기 (Esc)" @click="cancelLogin">✕</button>
      </header>
      <OnAirStrip v-if="live.channelCode.value" class="strip" />
      <p class="reason">{{ loginRequest?.reason }}</p>
      <LoginForm :preset-id="reauth ? presetId : undefined" @done="loginSucceeded" />
      <p class="note">{{ reauth ? 'DB 와 주고받는 작업이라 한 번 더 확인합니다. 5분 동안은 다시 묻지 않습니다.' : '로그인은 이 기기에 저장됩니다(로그아웃할 때까지).' }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.login-dlg {
  width: min(360px, calc(100vw - 32px)); display: grid; gap: 10px; padding: 16px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}
header { display: flex; align-items: center; }
h2 { flex: 1; margin: 0; font-size: 16px; }
.x { border: none; background: none; box-shadow: none; margin: 0; padding: 2px 8px; color: var(--muted); }
.reason { margin: 0; font-size: 13px; color: var(--text); line-height: 1.5; }
.note { margin: 0; font-size: 11px; color: var(--muted); }
.login-dlg :deep(.login) { padding: 0; border: 0; background: none; }
.login-dlg :deep(.login button) { padding: 10px; }
/* 폰: 전체 화면(입력칸이 있으므로 — 아래 시트는 화면 키패드에 가림). 내용은 위에서부터 */
@media (max-width: 768px) {
  .login-dlg { --m-pad-top: 12px; --m-pad-bottom: 16px; align-content: start; overflow-y: auto; }
  .strip { margin: 0 -16px; }
}
</style>
