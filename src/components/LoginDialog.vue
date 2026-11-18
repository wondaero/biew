<script setup lang="ts">
/**
 * 공용 로그인 팝업(src/lib/loginPrompt.ts). App.vue 에 하나만 둔다.
 * PC = 화면 가운데 작은 창, 모바일(≤768px) = 아래에서 올라오는 시트. 다른 팝업(📡 관리·서버 올리기 등) 위에 겹쳐 뜬다.
 * Esc·뒤로가기·바깥 누르기 = 취소(요청한 쪽에 false). 로그인되면 요청한 쪽이 하려던 동작을 이어서 한다.
 */
import { onMounted, onBeforeUnmount, nextTick } from 'vue'
import { loginRequest, cancelLogin } from '@/lib/loginPrompt'
import { useBackClose } from '@/lib/backClose'
import LoginForm from './LoginForm.vue'
import { useLive } from '@/live/liveStore'

useBackClose(() => true, cancelLogin)
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelLogin() } }
// 캡처 단계에서 받아 아래 팝업(출력 설정 등)의 Esc 처리보다 먼저 — 로그인 팝업만 닫히게
// 열린 동안 송출 단축키 막기. 닫을 때는 '열기 전 상태'로 — 출력 설정 팝업 위에 떴다 닫혀도 단축키가 다시 켜지지 않게
const live = useLive()
const pausedBefore = live.hotkeysPaused.value
onMounted(() => {
  live.hotkeysPaused.value = true
  window.addEventListener('keydown', onKey, true)
  void nextTick(() => document.querySelector<HTMLInputElement>('.login-dlg input')?.focus()) // 아이디 칸에 바로 입력
})
onBeforeUnmount(() => {
  live.hotkeysPaused.value = pausedBefore
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <div class="login-backdrop" @mousedown.self="cancelLogin">
    <div class="login-dlg" role="dialog" aria-modal="true" aria-label="로그인">
      <header>
        <h2>로그인</h2>
        <button class="x" title="닫기 (Esc)" @click="cancelLogin">✕</button>
      </header>
      <p class="reason">{{ loginRequest?.reason }}</p>
      <LoginForm />
      <p class="note">로그인은 이 기기에 저장됩니다(로그아웃할 때까지).</p>
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
/* 모바일: 아래에서 올라오는 시트 */
@media (max-width: 768px) {
  .login-backdrop { place-items: end stretch; }
  .login-dlg { width: auto; border-radius: 14px 14px 0 0; border-bottom: 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}
</style>
