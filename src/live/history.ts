/**
 * 선곡 기록(예배 기록) — 저장·목록·복사해서 시작·이름 바꾸기·지우기(2026-11-25 사용자 결정, 규칙: shared/history.ts).
 *  - 로컬 송출(LOCAL): 이 PC 의 IndexedDB 에만. 인터넷 불필요. 그림 슬라이드까지 담는다(그림 파일도 이 PC 에 있으므로).
 *  - 인터넷 송출 채널: 서버(channel_history, 호스트 토큰). 그림은 빼고 개수만. 인터넷이 끊겨 못 올리면 이 PC 에 보관(pending)했다가
 *    다시 연결되면 올린다(flushPending) — 오프라인에서도 기록은 남는다.
 *  - 자동 기록: 로컬 송출은 [송출 종료] 때. 그리고 컨트롤러를 열었을 때 남아 있는 선곡이 지난 날짜의 것이면(autoSaveStale) —
 *    인터넷 송출엔 [송출 종료]가 없어서, 다음 예배에 채널을 열면 지난 예배가 기록된다.
 *  - 같은 선곡을 연달아 두 번 저장하지 않는다('dup').
 */
import type { LiveState, SetlistItem } from '@shared/types'
import {
  HISTORY_MAX, HISTORY_TITLE_MAX, copySetlist, defaultHistoryTitle, historyFingerprint, isSetlist, sameLocalDay, stripMedia,
  type HistoryRow,
} from '@shared/history'
import * as db from '@/library/db'
import * as api from '@/channel/api'
import { loadHost, LOCAL_CODE } from './persistence'
import { uid } from '@/lib/uid'

const isLocal = (code: string) => code === LOCAL_CODE
const tokenOf = (code: string) => loadHost(code)?.token ?? null
const plain = (s: readonly SetlistItem[]): SetlistItem[] => JSON.parse(JSON.stringify(s)) // 반응형(Proxy)을 일반 값으로
const byNewest = <T extends { savedAt: string }>(a: T, b: T) => b.savedAt.localeCompare(a.savedAt)

/** 기본 이름(채널이면 채널 제목, 로컬이면 "예배") */
export function historyTitleFor(code: string, at = new Date()): string {
  return defaultHistoryTitle(at, isLocal(code) ? null : loadHost(code)?.title)
}

export type SaveResult = 'ok' | 'dup' | 'pending' | 'empty' | 'error'

/** 선곡을 기록으로 저장 */
export async function saveHistory(code: string, title: string, setlist: readonly SetlistItem[], savedAt = new Date().toISOString()): Promise<SaveResult> {
  if (!setlist.length) return 'empty'
  const name = title.trim().slice(0, HISTORY_TITLE_MAX) || historyTitleFor(code, new Date(savedAt))
  try {
    if (isLocal(code)) {
      const items = plain(setlist)
      const fingerprint = historyFingerprint(items)
      const list = (await db.listHistory(LOCAL_CODE)).sort(byNewest)
      if (list[0]?.fingerprint === fingerprint) return 'dup'
      await db.putHistory({ id: uid(), scope: LOCAL_CODE, title: name, savedAt, setlist: items, skippedMedia: 0, fingerprint, pending: false })
      for (const old of list.slice(HISTORY_MAX - 1)) await db.removeHistory(old.id) // 이 PC 도 최근 100개
      return 'ok'
    }
    const { setlist: items, skippedMedia } = stripMedia(plain(setlist))
    if (!items.length) return 'empty' // 그림뿐이면 서버 기록엔 남길 게 없음
    const fingerprint = historyFingerprint(items)
    const token = tokenOf(code)
    if (token && navigator.onLine) {
      const r = await api.historySave(code, token, { title: name, setlist: items, fingerprint, skippedMedia, savedAt })
      if (r.status === 'ok') return 'ok'
      if (r.status === 'dup') return 'dup'
      if (r.status === 'not_found' || r.status === 'invalid') return 'error'
      // token_rejected(권한 만료 — 로그인하면 다시)·error(인터넷) → 이 PC 에 보관
    }
    const pend = await db.listHistory(code)
    if (pend.some((p) => p.fingerprint === fingerprint)) return 'dup'
    await db.putHistory({ id: uid(), scope: code, title: name, savedAt, setlist: items, skippedMedia, fingerprint, pending: true })
    return 'pending'
  } catch {
    return 'error'
  }
}

/** 이 PC 에 보관해 둔(못 올린) 채널 기록을 서버로. 올린 개수. 같은 채널은 한 번에 하나만(동시에 돌면 같은 기록이 두 번 올라감) */
const flushing = new Map<string, Promise<number>>()
export function flushPending(code: string): Promise<number> {
  const cur = flushing.get(code)
  if (cur) return cur
  const p = doFlush(code).finally(() => flushing.delete(code))
  flushing.set(code, p)
  return p
}
async function doFlush(code: string): Promise<number> {
  if (isLocal(code)) return 0
  const token = tokenOf(code)
  if (!token || !navigator.onLine) return 0
  let n = 0
  try {
    const pend = (await db.listHistory(code)).sort((a, b) => a.savedAt.localeCompare(b.savedAt)) // 오래된 것부터(서버 순서 유지)
    for (const p of pend) {
      const r = await api.historySave(code, token, { title: p.title, setlist: p.setlist, fingerprint: p.fingerprint, skippedMedia: p.skippedMedia, savedAt: p.savedAt })
      // 서버가 영구히 거부하는 것(너무 큼·채널 없음)은 지운다 — 남겨 두면 뒤의 기록이 영영 못 올라감
      if (r.status === 'invalid' || r.status === 'not_found') { await db.removeHistory(p.id); continue }
      if (r.status !== 'ok' && r.status !== 'dup') break // 인터넷·권한 — 다음 연결 때 다시
      await db.removeHistory(p.id)
      n++
    }
  } catch { /* 다음에 다시 */ }
  return n
}

/** 목록(최신 먼저). 채널이면 이 PC 에 보관 중인 것 + 서버 것 */
export async function listHistoryRows(code: string): Promise<{ rows: HistoryRow[]; error?: string }> {
  const toRow = (h: db.LocalHistory): HistoryRow => ({ id: h.id, title: h.title, savedAt: h.savedAt, songs: h.setlist.length, skippedMedia: h.skippedMedia, pending: h.pending || undefined })
  try {
    const local = (await db.listHistory(code)).sort(byNewest).map(toRow)
    if (isLocal(code)) return { rows: local }
    const token = tokenOf(code)
    if (!token) return { rows: local, error: '이 PC 의 인터넷 송출 권한이 없어 서버 기록을 못 불러왔습니다 — 로그인하면 다시 연결됩니다' }
    if (!navigator.onLine) return { rows: local, error: '인터넷이 끊겨 서버 기록을 못 불러왔습니다(이 PC 에 보관 중인 것만 보입니다)' }
    const r = await api.historyList(code, token)
    if (r.status !== 'ok') return { rows: local, error: r.status === 'token_rejected' ? '권한이 만료돼 서버 기록을 못 불러왔습니다 — 로그인하면 다시 연결됩니다' : '서버 기록을 못 불러왔습니다' }
    const server: HistoryRow[] = r.rows.map((x) => ({ id: x.id, title: x.title, savedAt: x.saved_at, songs: x.songs, skippedMedia: x.skipped_media }))
    return { rows: [...local, ...server].sort(byNewest) }
  } catch {
    return { rows: [], error: '기록을 불러오지 못했습니다' }
  }
}

/** 기록의 선곡을 복사(새 항목 key)해서 돌려준다. 없으면 null */
export async function copyHistory(code: string, row: HistoryRow): Promise<SetlistItem[] | null> {
  try {
    if (isLocal(code) || row.pending) {
      const h = await db.getHistory(row.id)
      return h ? copySetlist(h.setlist, uid) : null
    }
    const token = tokenOf(code)
    if (!token) return null
    const r = await api.historyGet(code, token, row.id)
    return r.status === 'ok' && isSetlist(r.setlist) ? copySetlist(r.setlist, uid) : null
  } catch {
    return null
  }
}

export async function renameHistory(code: string, row: HistoryRow, title: string): Promise<boolean> {
  const name = title.trim().slice(0, HISTORY_TITLE_MAX)
  if (!name) return false
  try {
    if (isLocal(code) || row.pending) {
      const h = await db.getHistory(row.id)
      if (!h) return false
      await db.putHistory({ ...h, title: name })
      return true
    }
    const token = tokenOf(code)
    return !!token && (await api.historyRename(code, token, row.id, name)) === 'ok'
  } catch {
    return false
  }
}

export async function deleteHistory(code: string, row: HistoryRow): Promise<boolean> {
  try {
    if (isLocal(code) || row.pending) { await db.removeHistory(row.id); return true }
    const token = tokenOf(code)
    return !!token && (await api.historyDelete(code, token, row.id)) === 'ok'
  } catch {
    return false
  }
}

/**
 * 컨트롤러를 열었을 때: 남아 있는 선곡이 지난 날짜의 것이면 그날 이름으로 기록(인터넷 송출엔 [송출 종료]가 없으므로 —
 * 다음 예배에 채널을 열면 지난 예배가 남는다). 같은 선곡이 이미 기록돼 있으면 건너뜀.
 */
export async function autoSaveStale(code: string, state: Pick<LiveState, 'version' | 'setlist'>, now = new Date()): Promise<SaveResult | null> {
  if (!state.setlist.length || !state.version) return null
  const at = new Date(state.version)
  if (Number.isNaN(at.getTime()) || sameLocalDay(at, now) || at > now) return null
  return saveHistory(code, historyTitleFor(code, at), state.setlist, at.toISOString())
}
