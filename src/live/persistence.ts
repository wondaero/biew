import type { LiveState } from '@shared/types'
import { DEFAULT_STYLE } from '@shared/types'

/** 오프라인 모드(/local)의 '채널' 이름. 실제 채널 번호(6자, A-Z2-9)와 겹치지 않는다 */
export const LOCAL_CODE = 'LOCAL'

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

/** 저장본·받은 상태를 현재 형식으로 맞춘다(새 필드 추가·예전 값 이전) */
export function normalizeLive(s: LiveState): LiveState {
  const raw = (s.style ?? {}) as Partial<LiveState['style']>
  // 잘못 잡았던 임시 기본값(위 60)은 leftMargin 이 생기기 전 버전에서만 저장됐다.
  // 그 경우만 바로잡는다 — 사용자가 일부러 60(슬라이더 최대값)으로 둔 설정까지 매번 5로 되돌리면 안 되므로.
  const legacyTop60 = raw.topMargin === 60 && raw.leftMargin === undefined
  s.style = { ...DEFAULT_STYLE, ...s.style } // 새 스타일 필드 추가 대비
  s.frozen ??= null
  // 예전 값 'bottom'(하단 기준) → 상단 기준으로 이전
  if ((s.style.position as string) === 'bottom') s.style.position = 'top'
  if (legacyTop60) s.style.topMargin = DEFAULT_STYLE.topMargin
  return s
}

/** 받은 값이 쓸 수 있는 LiveState 인지 */
export function isLiveState(v: unknown): v is LiveState {
  const s = v as Partial<LiveState> | null
  return !!s && Array.isArray(s.setlist) && typeof s.version === 'number' && typeof s.origin === 'string'
}

export function saveLive(code: string, s: LiveState) {
  try { localStorage.setItem(keyOf(code), JSON.stringify(s)) } catch { /* quota/private mode */ }
}

// ── 호스트 기록: 이 PC 가 호스트인 채널 ────────────────────────────
/**
 * 채널을 만들거나(로그인 상태) 로그인해서 호스트로 연 PC 에만 남는다.
 * topic(실시간 비밀 주소)을 기억해 두므로 새로고침·로그아웃·오프라인이어도 로그인 없이 호스트로 열리고 폰과 다시 연결된다.
 * 계정 권한이 아니라 그 채널 하나의 송출 조작·연결만 가능. 다른 곳에서 "모든 기기 접속 끊기"를 하면 topic 이 바뀌어 무효 → 이 PC 에서 다시 로그인.
 */
export interface HostRecord { title: string; controlTopic: string | null; viewTopic: string | null; openedAt: string }
const HOST = 'biew.host.'

export function saveHost(code: string, r: Omit<HostRecord, 'openedAt'>) {
  try { localStorage.setItem(HOST + code, JSON.stringify({ ...r, openedAt: new Date().toISOString() })) } catch { /* ignore */ }
}
export function loadHost(code: string): HostRecord | null {
  try {
    const raw = localStorage.getItem(HOST + code)
    if (!raw) return null
    const r = JSON.parse(raw) as HostRecord
    return typeof r?.title === 'string' ? r : null
  } catch { return null }
}
/** 이 기기에서 호스트로 연 채널 목록(최근 연 순) */
export function listHosts(): (HostRecord & { code: string })[] {
  const out: (HostRecord & { code: string })[] = []
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(HOST)) continue
      const code = k.slice(HOST.length)
      const r = loadHost(code)
      if (r) out.push({ ...r, code })
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
}
/** 이 기기에서 채널 흔적(호스트 기록 + 콘티) 지우기. 서버의 채널은 그대로 */
export function forgetChannelLocal(code: string) {
  try { localStorage.removeItem(HOST + code); localStorage.removeItem(keyOf(code)) } catch { /* ignore */ }
}
