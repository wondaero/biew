import type { LiveState } from '@shared/types'
import { DEFAULT_STYLE } from '@shared/types'

const KEY = 'biew.live.v1'

export function loadLive(): LiveState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as LiveState
    if (!Array.isArray(s.setlist) || typeof s.version !== 'number') return null
    s.style = { ...DEFAULT_STYLE, ...s.style } // 새 스타일 필드 추가 대비
    // 예전 값 'bottom'(하단 기준) → 상단 기준으로 이전
    if ((s.style.position as string) === 'bottom') s.style.position = 'top'
    // 잘못 잡았던 임시 기본값(60)이 저장돼 남은 경우만 바로잡는다
    if (s.style.topMargin === 60) s.style.topMargin = DEFAULT_STYLE.topMargin
    return s
  } catch {
    return null
  }
}

export function saveLive(s: LiveState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* quota/private mode */ }
}

export const LIVE_STORAGE_KEY = KEY
