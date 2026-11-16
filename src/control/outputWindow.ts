/**
 * 출력 창 열기.
 * 1) Window Management API 로 두 번째 모니터를 찾아 그 영역을 꽉 채우는 팝업
 * 2) 불가하면 일반 새 창 + F11 안내
 * 전체화면 자체는 브라우저 정책상 출력 창 안에서 클릭 1번이 필요하다.
 */
type ScreenDetailed = Screen & { availLeft: number; availTop: number; isPrimary: boolean; label?: string }
type ScreenDetails = { screens: ScreenDetailed[]; currentScreen: ScreenDetailed }

export interface OpenResult { ok: boolean; placed: boolean; message: string }

let win: Window | null = null

export async function openOutputWindow(): Promise<OpenResult> {
  let features = 'popup,width=1280,height=720'
  let placed = false
  const w = window as Window & { getScreenDetails?: () => Promise<ScreenDetails> }
  if (typeof w.getScreenDetails === 'function') {
    try {
      const sd = await w.getScreenDetails()
      const other = sd.screens.find((s) => s !== sd.currentScreen) ?? sd.screens.find((s) => !s.isPrimary)
      if (other) {
        features = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`
        placed = true
      }
    } catch { /* 권한 거부 → 일반 창 */ }
  }

  if (win && !win.closed) {
    win.focus()
    return { ok: true, placed, message: '이미 열려 있는 출력 창으로 이동했습니다.' }
  }
  win = window.open('/output', 'biew-output', features)
  if (!win) return { ok: false, placed: false, message: '팝업이 차단되었습니다. 주소창의 팝업 차단 아이콘에서 허용해 주세요.' }
  return {
    ok: true,
    placed,
    message: placed
      ? '두 번째 모니터에 출력 창을 띄웠습니다. 출력 창을 한 번 클릭하면 전체화면이 됩니다.'
      : '새 창으로 열었습니다. 출력 모니터로 옮긴 뒤 창을 클릭하거나 F11 을 눌러 전체화면으로 바꿔 주세요.',
  }
}
