<script setup lang="ts">
/**
 * 로그인 폼(공용). 로그인은 저장되지 않는다 — 새로고침하면 다시 로그인.
 * ID/PW 는 브라우저 비밀번호 저장 기능이 채워 주도록 name/autocomplete 를 표준대로 둔다(앱이 비밀번호를 저장하지 않음).
 */
import { ref } from 'vue'
import { signIn } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

defineProps<{ hint?: string }>()
const emit = defineEmits<{ done: [] }>()

const email = ref('')
const pw = ref('')
const err = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  err.value = await signIn(email.value, pw.value)
  busy.value = false
  if (!err.value) { pw.value = ''; emit('done') }
}
</script>

<template>
  <form class="login" @submit.prevent="submit">
    <p v-if="hint" class="hint">{{ hint }}</p>
    <p v-if="!supabase" class="err">Supabase 설정(.env)이 없습니다.</p>
    <input v-model="email" name="username" type="email" placeholder="이메일" autocomplete="username" required />
    <input v-model="pw" name="password" type="password" placeholder="비밀번호" autocomplete="current-password" required />
    <button class="primary" :disabled="busy || !supabase">{{ busy ? '로그인 중…' : '로그인' }}</button>
    <p v-if="err" class="err">{{ err }}</p>
  </form>
</template>

<style scoped>
.login { display: grid; gap: 6px; padding: 10px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; }
.hint { margin: 0; font-size: 12px; color: var(--muted); }
.err { margin: 0; font-size: 12px; color: var(--pgm); }
</style>
