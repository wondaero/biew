/**
 * [⬇ 다운로드]·[⬆ 업로드] 버튼 → 비밀번호 재확인(requireReauth) → 목록 화면(DownloadDialog / UploadDialog).
 * 곡 목록 팝업(LibraryPanel)과 홈 곡 카드가 같이 쓴다(2026-11-19 사용자 결정: 두 버튼을 누를 때만 확인, 목록 화면에선 다시 안 물음).
 */
import { ref } from 'vue'
import { requireReauth } from '@/lib/loginPrompt'

export function useSyncDialogs() {
  const open = ref<'down' | 'up' | null>(null)
  async function go(kind: 'down' | 'up') {
    const reason = kind === 'down'
      ? 'DB 에서 곡을 받으려면 비밀번호를 한 번 더 확인합니다.'
      : '이 기기에서 바꾼 곡을 DB 에 올리려면 비밀번호를 한 번 더 확인합니다.'
    if (await requireReauth(reason)) open.value = kind
  }
  return { open, openDownload: () => go('down'), openUpload: () => go('up'), close: () => { open.value = null } }
}
