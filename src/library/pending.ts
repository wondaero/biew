/**
 * '서버에 올리기' 전에 PC 변경(pending) 한 건을 분류한다(순수 함수 — 테스트 대상).
 *  - 새 곡: 서버 곡 + 다른 PC 새 곡과 중복 검사(가사 === / 제목 ===, shared/songCompare)
 *  - 수정·삭제: 고치기(지우기) 시작한 뒤 서버 곡이 바뀌었으면 'changed', 서버에서 지워졌으면 'deleted'
 * + DB 와 이 기기 비교(다운로드 목록): diffIndex
 */
import type { Song } from '@shared/types'
import { findDuplicates, type Duplicates } from '@shared/songCompare'
import type { PendingSong } from './db'

export interface UploadItem {
  p: PendingSong
  /** 수정일 때 지금 서버 버전(없으면 서버에서 삭제됨) */
  server: Song | null
  dup: Duplicates<Song>
  conflict: 'changed' | 'deleted' | null
}

export const pendingAsSong = (p: PendingSong, source_file: string | null = null): Song => ({
  id: p.id, title: p.title, slides: p.slides, source_file, updated_at: p.savedAt, deleted_at: null,
})

export function classifyPending(p: PendingSong, serverSongs: Song[], allPending: PendingSong[]): UploadItem {
  const none: Duplicates<Song> = { sameLyrics: [], sameTitle: [] }
  if (p.kind === 'new') {
    // 이 기기에서 지우려는 곡은 중복 후보에서 뺀다
    const gone = new Set(allPending.filter((x) => x.kind === 'delete').map((x) => x.id))
    const pool = [...serverSongs.filter((s) => !gone.has(s.id)), ...allPending.filter((x) => x.kind === 'new' && x.id !== p.id).map((x) => pendingAsSong(x))]
    return { p, server: null, dup: findDuplicates(p, pool), conflict: null }
  }
  const server = serverSongs.find((s) => s.id === p.id) ?? null
  const conflict = !server ? 'deleted' : p.base && server.updated_at !== p.base.updated_at ? 'changed' : null
  return { p, server, dup: none, conflict }
}

/** DB 목록의 한 줄(가사 없이 가벼움) */
export interface RemoteRow { id: string; updated_at: string; deleted_at: string | null }
export type RemoteKind = 'new' | 'changed' | 'deleted'

/**
 * DB 와 이 기기(받아 둔 곡) 비교 — 다운로드 목록. "마지막으로 받은 뒤 바뀐 것"이 아니라 통째로 비교하므로
 * 건너뛴 항목은 다음에도 다시 나오고, DB 에서 완전히 사라진 곡(유령 곡)도 'deleted' 로 잡힌다.
 */
export function diffIndex(cache: readonly { id: string; updated_at: string }[], remote: readonly RemoteRow[]): { id: string; kind: RemoteKind }[] {
  const R = new Map(remote.map((r) => [r.id, r]))
  const C = new Map(cache.map((c) => [c.id, c]))
  const out: { id: string; kind: RemoteKind }[] = []
  for (const r of remote) {
    if (r.deleted_at) continue
    const c = C.get(r.id)
    if (!c) out.push({ id: r.id, kind: 'new' })
    else if (c.updated_at !== r.updated_at) out.push({ id: r.id, kind: 'changed' })
  }
  for (const c of cache) { const r = R.get(c.id); if (!r || r.deleted_at) out.push({ id: c.id, kind: 'deleted' }) }
  return out
}

/** 문제 없는 항목인가(체크박스만으로 올릴 수 있음) */
export const isClean = (i: UploadItem) =>
  !i.conflict && i.dup.sameLyrics.length === 0 && i.dup.sameTitle.length === 0
