/**
 * '서버에 올리기' 전에 PC 변경(pending) 한 건을 분류한다(순수 함수 — 테스트 대상).
 *  - 새 곡: 서버 곡 + 다른 PC 새 곡과 중복 검사(가사 === / 제목 ===, shared/songCompare)
 *  - 수정: 고치기 시작한 뒤 서버 곡이 바뀌었으면 'changed', 서버에서 지워졌으면 'deleted'
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
    const pool = [...serverSongs, ...allPending.filter((x) => x.kind === 'new' && x.id !== p.id).map((x) => pendingAsSong(x))]
    return { p, server: null, dup: findDuplicates(p, pool), conflict: null }
  }
  const server = serverSongs.find((s) => s.id === p.id) ?? null
  const conflict = !server ? 'deleted' : p.base && server.updated_at !== p.base.updated_at ? 'changed' : null
  return { p, server, dup: none, conflict }
}

/** 문제 없는 항목인가(체크박스만으로 올릴 수 있음) */
export const isClean = (i: UploadItem) =>
  !i.conflict && i.dup.sameLyrics.length === 0 && i.dup.sameTitle.length === 0
