import { DEFAULT_BACKDROP, type Backdrop } from './backdrop'

export interface Song {
  id: string
  title: string
  slides: string[]
  source_file: string | null
  updated_at: string
  deleted_at: string | null
}

export interface SetlistItem {
  /** 선곡 항목 고유키 — 같은 곡을 두 번 넣어도 구분 */
  key: string
  songId: string
  title: string
  /** 추가 시점 스냅샷. 예배 중 DB가 바뀌어도 슬라이드 번호가 흔들리지 않게 */
  slides: string[]
}

/** top = 첫 줄 위치를 고정하고 줄이 늘면 아래로 자람 / center = 세로 가운데 */
export type TextPosition = 'top' | 'center'
export type TransitionKind = 'cut' | 'fade'

export interface OutputStyle {
  fontFamily: string
  /** 화면 높이 대비 % (cqh). 썸네일·출력이 같은 비율로 그려짐 */
  fontSize: number
  fontWeight: 400 | 700 | 800
  lineHeight: number
  color: string
  outlineWidth: number // cqh
  outlineColor: string
  shadow: boolean
  position: TextPosition
  /** 여백은 위·왼쪽만 쓴다(오른쪽·아래는 화면 끝까지). 글은 (leftMargin, topMargin) 에서 시작 */
  topMargin: number // cqh — position=top 일 때
  leftMargin: number // cqw
  /** 배경: 단색·2색 그라데이션(나중에 이미지 추가 가능) — shared/backdrop.ts. 예전 background: 'black'|'green' 은 불러올 때 이전 */
  backdrop: Backdrop
  transition: TransitionKind
  fadeMs: number
}

/**
 * FREEZE: 걸어 둔 순간의 송출 화면. 컨트롤러는 계속 움직여도 출력·뷰어는 이걸 유지한다.
 * 텍스트까지 스냅샷으로 들고 있는 이유: freeze 중 가사를 고쳐 선곡을 갱신해도 송출이 바뀌면 안 되므로.
 */
export interface Frozen {
  itemIndex: number
  slideIndex: number
  blank: boolean
  text: string | null
}

export interface LiveState {
  /** 증가하는 버전. 수신 측은 더 큰 version 만 반영 */
  version: number
  /** 마지막으로 바꾼 주체 (Phase 2: 여러 기기 구분/동률 판정) */
  origin: string
  setlist: SetlistItem[]
  itemIndex: number
  slideIndex: number
  blank: boolean
  /** null/없음 = 해제. 예전 저장 상태엔 필드가 없을 수 있다 */
  frozen?: Frozen | null
  style: OutputStyle
}

export const DEFAULT_STYLE: OutputStyle = {
  fontFamily: 'Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  fontSize: 7,
  fontWeight: 700,
  lineHeight: 1.35,
  color: '#ffffff',
  outlineWidth: 0.35,
  outlineColor: '#000000',
  shadow: true,
  position: 'top',
  topMargin: 5,
  leftMargin: 5,
  backdrop: { ...DEFAULT_BACKDROP },
  transition: 'fade',
  fadeMs: 250,
}

export function emptyLiveState(origin: string): LiveState {
  return { version: 0, origin, setlist: [], itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: { ...DEFAULT_STYLE } }
}

/** 상태가 더 새로운지. version 동률이면 origin 사전순으로 결정(모든 기기가 같은 결론) */
export function isNewer(a: Pick<LiveState, 'version' | 'origin'>, b: Pick<LiveState, 'version' | 'origin'> | null): boolean {
  if (!b) return true
  return a.version > b.version || (a.version === b.version && a.origin > b.origin)
}

export function nextVersion(prev: number): number {
  return Math.max(prev + 1, Date.now())
}
