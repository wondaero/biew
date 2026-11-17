import type { LiveState } from '@shared/types'
import { DEFAULT_STYLE } from '@shared/types'

/** 오프라인 모드(/local)의 '채널' 이름. 실제 채널 번호(6자, A-Z2-9)와 겹치지 않는다 */
export const LOCAL_CODE = 'LOCAL'

/** 채널마다 따로 저장: biew.live.v1:<CODE>. (도메인별 localStorage 라 localhost 와 배포 주소는 별개) */
const KEY = 'biew.live.v1'
const keyOf = (code: string) => `${KEY}:${code}`

/**
 * 예전 버전이 남긴 브라우저 저장값 정리(시작할 때 한 번, 여러 번 돌아도 무해).
 *  - biew.live.v1 (채널 번호 없는 옛 단일 콘티) · biew.room.v1 (옛 폰 공유 코드) · biew.hosted.* (옛 호스트 표시)
 */
export function cleanupLegacyStorage() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k === KEY || k === 'biew.room.v1' || k.startsWith('biew.hosted.')) localStorage.removeItem(k)
    }
  } catch { /* private mode */ }
}

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

// ── 호스트 기록: 이 PC 가 인터넷 송출의 호스트인 채널 ───────────────────
/**
 * 채널을 만들거나(로그인 상태) 로그인해서 호스트로 연 PC 에만 남는다.
 * token = 채널 전용 호스트 토큰(계정 로그인 아님). 서버에 상태를 올리고 읽는 권한 — 그 채널 하나의 송출만.
 * 로그인을 저장하지 않으므로 새로고침·로그아웃·오프라인이어도 이 토큰으로 호스트가 된다.
 * "모든 기기 접속 끊기"(어디서 하든)나 30일 미사용이면 서버가 거부 → 이 PC 에서 다시 로그인하면 새 토큰.
 */
export interface HostRecord {
  title: string
  token: string | null
  controlTopic: string | null
  viewTopic: string | null
  openedAt: string
}
const HOST = 'biew.host.'
const DIRTY = 'biew.hostdirty.'

export function saveHost(code: string, r: Omit<HostRecord, 'openedAt'>) {
  try { localStorage.setItem(HOST + code, JSON.stringify({ ...r, openedAt: new Date().toISOString() })) } catch { /* ignore */ }
}
/** 일부만 갱신(토큰 무효화·topic 갱신 등) */
export function patchHost(code: string, patch: Partial<Omit<HostRecord, 'openedAt'>>) {
  const r = loadHost(code)
  if (r) saveHost(code, { title: r.title, token: r.token, controlTopic: r.controlTopic, viewTopic: r.viewTopic, ...patch })
}
export function loadHost(code: string): HostRecord | null {
  try {
    const raw = localStorage.getItem(HOST + code)
    if (!raw) return null
    const r = JSON.parse(raw) as Partial<HostRecord>
    if (typeof r?.title !== 'string') return null
    return { title: r.title, token: r.token ?? null, controlTopic: r.controlTopic ?? null, viewTopic: r.viewTopic ?? null, openedAt: r.openedAt ?? '' }
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
/**
 * 서버에 아직 못 올린 PC 변경이 있는지(인터넷이 끊긴 동안 PC 혼자 송출).
 * 다시 연결되면 PC 기준으로 서버를 덮어쓴다(force). 새로고침해도 잊지 않도록 저장.
 */
export function setHostDirty(code: string, dirty: boolean) {
  try { dirty ? localStorage.setItem(DIRTY + code, '1') : localStorage.removeItem(DIRTY + code) } catch { /* ignore */ }
}
export function isHostDirty(code: string): boolean {
  try { return localStorage.getItem(DIRTY + code) === '1' } catch { return false }
}
/** 이 기기에서 채널 흔적(호스트 기록 + 콘티) 지우기. 서버의 채널은 그대로 */
export function forgetChannelLocal(code: string) {
  try { localStorage.removeItem(HOST + code); localStorage.removeItem(DIRTY + code); localStorage.removeItem(keyOf(code)) } catch { /* ignore */ }
}

// ── 이 기기에서 들어간 채널(리모컨·보기) ────────────────────────────
/**
 * 홈의 "이 기기의 채널"에 보여 줄 기록. 들어갈 때 저장 → 다음엔 목록에서 바로(입장 토큰이 있으면 비밀번호 없이).
 * 이 기기가 이미 들어갈 수 있는 채널만 남으므로 보안상 새로 열리는 것은 없다.
 */
export type VisitRole = 'control' | 'view'
export interface VisitRecord { title: string; at: string }
const VISIT = 'biew.visit.'
const visitKey = (role: VisitRole, code: string) => `${VISIT}${role}.${code}`

export function saveVisit(code: string, role: VisitRole, title: string) {
  try { localStorage.setItem(visitKey(role, code), JSON.stringify({ title, at: new Date().toISOString() })) } catch { /* ignore */ }
}
export function forgetVisit(code: string, role: VisitRole) {
  try { localStorage.removeItem(visitKey(role, code)) } catch { /* ignore */ }
}
export function listVisits(): (VisitRecord & { code: string; role: VisitRole })[] {
  const out: (VisitRecord & { code: string; role: VisitRole })[] = []
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(VISIT)) continue
      const [role, code] = k.slice(VISIT.length).split('.') as [VisitRole, string]
      if ((role !== 'control' && role !== 'view') || !code) continue
      const r = JSON.parse(localStorage.getItem(k) ?? 'null') as VisitRecord | null
      if (r && typeof r.title === 'string') out.push({ ...r, code, role })
    }
  } catch { /* ignore */ }
  return out
}
