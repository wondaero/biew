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
    return s
  } catch {
    return null
  }
}

export function saveLive(s: LiveState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* quota/private mode */ }
}

export const LIVE_STORAGE_KEY = KEY
