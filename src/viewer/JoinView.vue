<script setup lang="ts">
/** /view — 방 번호만 입력해서 들어가는 화면(다른 PC/폰에서 링크 없이 접속할 때) */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const raw = ref('')
const input = ref<HTMLInputElement>()
// 방코드는 영문 대문자+숫자 6자리. 공백/하이픈 등은 무시하고 대문자로
const code = computed(() => raw.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
const ok = computed(() => code.value.length === 6)

function go() {
  if (ok.value) router.push(`/view/${code.value}`)
}
onMounted(() => {
  document.title = '방 번호 입력 — Biew'
  input.value?.focus()
})
</script>

<template>
  <main class="join">
    <form @submit.prevent="go">
      <h1>방 번호 입력</h1>
      <p>송출하는 컨트롤러의 📱 폰 화면에 나온 6자리 번호입니다.</p>
      <input
        ref="input"
        :value="code"
        class="code"
        inputmode="text"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="12"
        placeholder="ABC234"
        @input="raw = ($event.target as HTMLInputElement).value"
      />
      <button class="primary" :disabled="!ok">입장</button>
    </form>
  </main>
</template>

<style scoped>
.join { min-height: 100dvh; display: grid; place-content: center; padding: 24px; background: #0e0e11; color: #eee; }
form { display: grid; gap: 14px; width: min(340px, 100%); text-align: center; }
h1 { margin: 0; font-size: 20px; }
p { margin: 0; color: #999; font-size: 13px; }
.code { text-align: center; font: 700 30px/1 ui-monospace, monospace; letter-spacing: 6px; padding: 14px 8px; text-transform: uppercase; }
button { padding: 12px; font-size: 16px; }
</style>
