import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const session = ref<Session | null>(null)
export const authReady = ref(false)

if (supabase) {
  // getSession 은 로컬 저장소에서 읽음 → 오프라인에서도 동작
  supabase.auth.getSession().then(({ data }) => { session.value = data.session; authReady.value = true })
  supabase.auth.onAuthStateChange((_e, s) => { session.value = s })
} else {
  authReady.value = true
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase 설정(.env)이 없습니다'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function signOut() {
  await supabase?.auth.signOut()
}
