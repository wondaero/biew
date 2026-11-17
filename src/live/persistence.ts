import type { LiveState } from '@shared/types'
import { DEFAULT_STYLE } from '@shared/types'

/** 채널마다 따로 저장: biew.live.v1:<CODE>. (도메인별 localStorage 라 localhost 와 배포 주소는 별개) */
const KEY = 'biew.live.v1'
const keyOf = (code: string) => `${KEY}:${code}`

export function loadLive(code: string): LiveState | null {
  try {
    const raw = localStorage.getItem(keyOf(code))
    if (!raw) return null
    const s = JSON.parse(raw) as LiveState
    if (!Array.isArray(s.setlist) || typeof s.version !== 'number') return null
    return normalizeLive(s)
  } catch {
    return null
  }
}

/** 저장본·서버에서 받은 상태를 현재 형식으로 맞춘다(새 필드 추가·예전 값 이전) */
export function normalizeLive(s: LiveState): LiveState {
  s.style = { ...DEFAULT_STYLE, ...s.style } // 새 스타일 필드 추가 대비
  s.frozen ??= null
  // 예전 값 'bottom'(하단 기준) → 상단 기준으로 이전
  if ((s.style.position as string) === 'bottom') s.style.position = 'top'
  // 잘못 잡았던 임시 기본값(60)이 저장돼 남은 경우만 바로잡는다
  if (s.style.topMargin === 60) s.style.topMargin = DEFAULT_STYLE.topMargin
  return s
}

/** 서버에서 받은 값이 쓸 수 있는 LiveState 인지(빈 채널은 state 가 {} ) */
export function isLiveState(v: unknown): v is LiveState {
  const s = v as Partial<LiveState> | null
  return !!s && Array.isArray(s.setlist) && typeof s.version === 'number' && typeof s.origin === 'string'
}

export function saveLive(code: string, s: LiveState) {
  try { localStorage.setItem(keyOf(code), JSON.stringify(s)) } catch { /* quota/private mode */ }
}

/** 이 브라우저가 호스트로 연 적 있는 채널(오프라인에서 새로고침해도 호스트로 다시 열기 위해) */
const hostedKey = (code: string) => `biew.hosted.${code}`
export function markHosted(code: string, title: string) {
  try { localStorage.setItem(hostedKey(code), title) } catch { /* ignore */ }
}
export function hostedTitle(code: string): string | null {
  try { return localStorage.getItem(hostedKey(code)) } catch { return null }
}
export function clearChannelLocal(code: string) {
  try { localStorage.removeItem(keyOf(code)); localStorage.removeItem(hostedKey(code)) } catch { /* ignore */ }
}
