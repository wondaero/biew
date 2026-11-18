import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { toLoginEmail } from '@shared/loginId'

export const session = ref<Session | null>(null)
export const authReady = ref(false)

if (supabase) {
  // getSession 은 로컬 저장소에서 읽음 → 오프라인에서도 동작
  supabase.auth.getSession().then(({ data }) => { session.value = data.session; authReady.value = true })
  supabase.auth.onAuthStateChange((_e, s) => { session.value = s })
} else {
  authReady.value = true
}

/** id = 아이디(도메인 자동) 또는 전체 이메일 */
export async function signIn(id: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase 설정(.env)이 없습니다'
  const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(id), password })
  if (!error) return null
  return /invalid login credentials/i.test(error.message) ? '아이디 또는 비밀번호가 맞지 않습니다' : error.message
}

export async function signOut() {
  await supabase?.auth.signOut()
}
