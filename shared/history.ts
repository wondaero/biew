/**
 * 선곡 기록(예배 기록) — 순수 규칙(2026-11-25 사용자 결정). "a채널 안에 지난주 예배·이번주 예배"처럼 선곡을 쌓아 두고,
 * 기록을 복사해 새 선곡으로 시작한다.
 *  - 기록 = 이름(날짜 + 제목) · 저장 시각 · 선곡(곡 제목 + 그날 쓴 슬라이드 그대로). 송출 위치·출력 설정은 넣지 않음.
 *  - 로컬 송출 = 이 PC(IndexedDB), 인터넷 송출 채널 = 서버(channel_history). 서버 기록엔 그림 슬라이드를 넣지 않는다
 *    (그림은 크고, 선곡에서 빼면 서버에서 바로 지움) — 빠진 그림 묶음 수만 남긴다.
 *  - 같은 선곡을 연달아 두 번 저장하지 않는다(fingerprint — 가장 최근 기록과 같으면 건너뜀).
 */
import type { SetlistItem } from './types'
import { isMediaItem } from './media'

export const HISTORY_MAX = 100
export const HISTORY_TITLE_MAX = 60

export interface HistoryRecord {
  id: string
  title: string
  /** ISO 시각 */
  savedAt: string
  setlist: SetlistItem[]
  /** 서버 기록에서 빠진 그림 묶음 수 */
  skippedMedia: number
}

/** 목록에 보이는 요약 */
export interface HistoryRow {
  id: string
  title: string
  savedAt: string
  songs: number
  skippedMedia: number
  /** 인터넷이 끊겨 아직 서버에 못 올린 것(이 PC 에만 있음) */
  pending?: boolean
}

/** 선곡 내용의 지문(제목 + 슬라이드) — 같은 선곡인지 비교용. 항목 key 는 무시 */
export function historyFingerprint(setlist: readonly Pick<SetlistItem, 'title' | 'slides'>[]): string {
  const s = JSON.stringify(setlist.map((it) => [it.title, it.slides]))
  // FNV-1a 32bit 두 번(앞뒤) — 암호용이 아니라 비교용
  let a = 0x811c9dc5, b = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0
    b = Math.imul(b ^ s.charCodeAt(s.length - 1 - i), 0x01000193) >>> 0
  }
  return `${s.length.toString(36)}-${a.toString(36)}-${b.toString(36)}`
}

/** 서버에 올릴 선곡: 그림 묶음은 빼고 개수만 */
export function stripMedia(setlist: readonly SetlistItem[]): { setlist: SetlistItem[]; skippedMedia: number } {
  const kept = setlist.filter((it) => !isMediaItem(it))
  return { setlist: kept.map((it) => ({ ...it, slides: [...it.slides] })), skippedMedia: setlist.length - kept.length }
}

/** 기록을 복사해 새 선곡으로 — 항목 key 를 새로(같은 기록을 두 번 불러와도 겹치지 않게) */
export function copySetlist(setlist: readonly SetlistItem[], newKey: () => string): SetlistItem[] {
  return setlist.map((it) => ({ ...it, key: newKey(), slides: [...it.slides] }))
}

/** 기본 이름: "11/24 주일 2부" (제목이 없으면 "11/24 예배") */
export function defaultHistoryTitle(at: Date, channelTitle?: string | null): string {
  const d = `${at.getMonth() + 1}/${at.getDate()}`
  const t = (channelTitle ?? '').trim()
  return `${d} ${t || '예배'}`.slice(0, HISTORY_TITLE_MAX)
}

/** 같은 날(이 기기 시간대)인지 */
export function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 받은 값이 쓸 수 있는 선곡인지(서버·IndexedDB 에서 읽은 것 검사) */
export function isSetlist(v: unknown): v is SetlistItem[] {
  return Array.isArray(v) && v.every((it) => it && typeof it === 'object'
    && typeof (it as SetlistItem).title === 'string' && typeof (it as SetlistItem).songId === 'string'
    && Array.isArray((it as SetlistItem).slides) && (it as SetlistItem).slides.every((x) => typeof x === 'string'))
}
