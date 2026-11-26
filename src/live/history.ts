/**
 * 선곡 기록(예배 기록) — 규칙: shared/history.ts.
 *  - 로컬 송출(LOCAL): 이 PC 의 IndexedDB 에만. 인터넷 불필요. 그림 슬라이드까지 담는다(그림 파일도 이 PC 에 있으므로).
 *  - 인터넷 송출 채널: 서버(channel_history, 호스트 토큰). 그림은 빼고 개수만. 인터넷이 끊겨 못 올리면 이 PC 에 보관(pending)했다가
 *    다시 연결되면 올린다(flushPending).
 *  - 2026-11-26 사용자 결정: 문서 프로그램처럼 [저장](불러온 기록에 덮어쓰기) / [다른 이름으로 저장](새 기록).
 *    항목을 누르면 곡 목록이 펼쳐지고 [불러오기]. 지금 선곡과 연결된 기록(link)은 채널마다 이 PC 에(localStorage).
 *    지난 날짜 기록에 [저장]하면 확인. **자동 기록은 없앰**(시점을 알 수 없어 준비만 한 선곡이 엉뚱한 날짜로 남음) —
 *    대신 선곡을 비우거나 바꿀 때 저장 안 됐으면 확인창에 알린다(isUnsaved).
 */
import { ref } from 'vue'
import type { SetlistItem } from '@shared/types'
import {
  HISTORY_MAX, HISTORY_TITLE_MAX, copySetlist, defaultHistoryTitle, isSetlist, recordFingerprint, stripMedia, isUnsaved,
  type HistoryRow, type HistoryLink,
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

// ── 지금 선곡과 연결된 기록(link) ──────────────────────
const LINK = 'biew.historyLink.'
/** 화면 갱신용(연결이 바뀌면 +1) */
export const linkTick = ref(0)
export function getLink(code: string): HistoryLink | null {
  void linkTick.value
  try {
    const l = JSON.parse(localStorage.getItem(LINK + code) ?? 'null') as HistoryLink | null
    return l && typeof l.id === 'string' && typeof l.fp === 'string' ? l : null
  } catch { return null }
}
export function setLink(code: string, l: HistoryLink | null) {
  try { l ? localStorage.setItem(LINK + code, JSON.stringify(l)) : localStorage.removeItem(LINK + code) } catch { /* ignore */ }
  linkTick.value++
}
/** 지금 선곡이 기록에 저장 안 된 상태인지(비우기·불러오기·송출 종료 확인창에 알림) */
export function unsavedNow(code: string, setlist: readonly SetlistItem[]): boolean {
  return isUnsaved(isLocal(code), setlist, getLink(code))
}

export type SaveResult = 'ok' | 'pending' | 'empty' | 'error' | 'offline' | 'missing'

/** [다른 이름으로 저장] — 새 기록, 그 기록에 연결. 같은 내용이어도 남긴다(사람이 누른 저장) */
export async function saveAsHistory(code: string, title: string, setlist: readonly SetlistItem[]): Promise<SaveResult> {
  if (!setlist.length) return 'empty'
  const savedAt = new Date().toISOString()
  const name = title.trim().slice(0, HISTORY_TITLE_MAX) || historyTitleFor(code)
  try {
    if (isLocal(code)) {
      const items = plain(setlist)
      const fingerprint = recordFingerprint(true, items)
      const id = uid()
      await db.putHistory({ id, scope: LOCAL_CODE, title: name, savedAt, setlist: items, skippedMedia: 0, fingerprint, pending: false })
      const list = (await db.listHistory(LOCAL_CODE)).sort(byNewest)
      for (const old of list.slice(HISTORY_MAX)) await db.removeHistory(old.id) // 이 PC 도 최근 100개
      setLink(code, { id, title: name, savedAt, fp: fingerprint })
      return 'ok'
    }
    const { setlist: items, skippedMedia } = stripMedia(plain(setlist))
    if (!items.length) return 'empty' // 그림뿐이면 서버 기록엔 남길 게 없음
    const fingerprint = recordFingerprint(false, setlist)
    const token = tokenOf(code)
    if (token && navigator.onLine) {
      const r = await api.historySave(code, token, { title: name, setlist: items, fingerprint, skippedMedia, savedAt, allowDup: true })
      if (r.status === 'ok' && r.id) { setLink(code, { id: r.id, title: name, savedAt, fp: fingerprint }); return 'ok' }
      if (r.status === 'not_found' || r.status === 'invalid') return 'error'
      // token_rejected(권한 만료 — 로그인하면 다시)·error(인터넷) → 이 PC 에 보관
    }
    const id = uid()
    await db.putHistory({ id, scope: code, title: name, savedAt, setlist: items, skippedMedia, fingerprint, pending: true })
    setLink(code, { id, title: name, savedAt, fp: fingerprint })
    return 'pending'
  } catch {
    return 'error'
  }
}

/** [저장] — 연결된 기록에 덮어쓰기(이름은 그대로). 연결이 없으면 호출하지 말 것(화면이 [다른 이름으로 저장]으로) */
export async function overwriteHistory(code: string, setlist: readonly SetlistItem[]): Promise<SaveResult> {
  const link = getLink(code)
  if (!link) return 'missing'
  if (!setlist.length) return 'empty'
  const savedAt = new Date().toISOString()
  try {
    const local = isLocal(code)
    const fingerprint = recordFingerprint(local, setlist)
    const { setlist: items, skippedMedia } = local ? { setlist: plain(setlist), skippedMedia: 0 } : stripMedia(plain(setlist))
    if (!items.length) return 'empty'
    // 로컬 기록 또는 아직 서버에 못 올린 채널 기록(이 PC 에 있음)
    const mine = await db.getHistory(link.id)
    if (mine) {
      await db.putHistory({ ...mine, setlist: items, skippedMedia, fingerprint, savedAt })
      setLink(code, { ...link, savedAt, fp: fingerprint })
      return mine.pending ? 'pending' : 'ok'
    }
    if (local) { setLink(code, null); return 'missing' }
    const token = tokenOf(code)
    if (!token || !navigator.onLine) return 'offline'
    const r = await api.historyUpdate(code, token, link.id, { setlist: items, fingerprint, skippedMedia })
    if (r === 'ok') { setLink(code, { ...link, savedAt, fp: fingerprint }); return 'ok' }
    if (r === 'missing') { setLink(code, null); return 'missing' }
    return r === 'error' ? 'offline' : 'error'
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
      const r = await api.historySave(code, token, { title: p.title, setlist: p.setlist, fingerprint: p.fingerprint, skippedMedia: p.skippedMedia, savedAt: p.savedAt, allowDup: true })
      // 서버가 영구히 거부하는 것(너무 큼·채널 없음)은 지운다 — 남겨 두면 뒤의 기록이 영영 못 올라감
      if (r.status === 'invalid' || r.status === 'not_found') { await db.removeHistory(p.id); continue }
      if (r.status !== 'ok' && r.status !== 'dup') break // 인터넷·권한 — 다음 연결 때 다시
      await db.removeHistory(p.id)
      // 연결돼 있던 기록이면 서버 id 로 옮긴다(다음 [저장]이 서버 기록에 덮어쓰게)
      const link = getLink(code)
      if (link?.id === p.id && r.id) setLink(code, { ...link, id: r.id })
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

/** 기록의 선곡(그대로 — 펼쳐 보기용). 없으면 null */
export async function getHistorySetlist(code: string, row: HistoryRow): Promise<SetlistItem[] | null> {
  try {
    if (isLocal(code) || row.pending) return (await db.getHistory(row.id))?.setlist ?? null
    const token = tokenOf(code)
    if (!token) return null
    const r = await api.historyGet(code, token, row.id)
    return r.status === 'ok' && isSetlist(r.setlist) ? r.setlist : null
  } catch {
    return null
  }
}

/** [불러오기]: 기록의 선곡을 복사(새 항목 key)해서 돌려주고 그 기록에 연결 — 이후 [저장]은 이 기록에 덮어쓴다 */
export async function loadHistory(code: string, row: HistoryRow, setlist?: SetlistItem[] | null): Promise<SetlistItem[] | null> {
  const src = setlist ?? (await getHistorySetlist(code, row))
  if (!src) return null
  const items = copySetlist(src, uid)
  setLink(code, { id: row.id, title: row.title, savedAt: row.savedAt, fp: recordFingerprint(isLocal(code), items) })
  return items
}

export async function renameHistory(code: string, row: HistoryRow, title: string): Promise<boolean> {
  const name = title.trim().slice(0, HISTORY_TITLE_MAX)
  if (!name) return false
  try {
    let ok: boolean
    if (isLocal(code) || row.pending) {
      const h = await db.getHistory(row.id)
      if (!h) return false
      await db.putHistory({ ...h, title: name })
      ok = true
    } else {
      const token = tokenOf(code)
      ok = !!token && (await api.historyRename(code, token, row.id, name)) === 'ok'
    }
    const link = getLink(code)
    if (ok && link?.id === row.id) setLink(code, { ...link, title: name })
    return ok
  } catch {
    return false
  }
}

export async function deleteHistory(code: string, row: HistoryRow): Promise<boolean> {
  try {
    let ok: boolean
    if (isLocal(code) || row.pending) { await db.removeHistory(row.id); ok = true }
    else {
      const token = tokenOf(code)
      ok = !!token && (await api.historyDelete(code, token, row.id)) === 'ok'
    }
    if (ok && getLink(code)?.id === row.id) setLink(code, null) // 연결된 기록을 지우면 [저장] = 새로
    return ok
  } catch {
    return false
  }
}

/** 선곡을 비우면(송출 종료·비우기) 연결도 끊는다 — 빈 선곡에 [저장]이 옛 기록을 덮어쓰지 않게 */
export function unlinkOnClear(code: string) {
  if (getLink(code)) setLink(code, null)
}
