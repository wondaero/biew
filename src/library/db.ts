import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Song } from '@shared/types'

/**
 * PC 에서 고친 곡 / 새로 등록한 곡 — 서버에 아직 안 올라간 변경(오프라인·로그인 없이 저장한 것).
 * '서버에 올리기'에서 중복·충돌을 검사한 뒤 올리고 지운다.
 *  - kind 'new'  : id 는 'local-…'(서버에 없음)
 *  - kind 'edit' : id 는 서버 곡 id. base = 고치기 시작할 때의 서버 버전(updated_at 으로 충돌 판정)
 */
export interface PendingSong {
  id: string
  kind: 'new' | 'edit'
  title: string
  slides: string[]
  base: { updated_at: string; title: string; slides: string[] } | null
  savedAt: string
}

interface BiewDB extends DBSchema {
  songs: { key: string; value: Song }
  meta: { key: string; value: string }
  pending: { key: string; value: PendingSong }
}

let dbp: Promise<IDBPDatabase<BiewDB>> | null = null
function db() {
  dbp ??= openDB<BiewDB>('biew', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('songs', { keyPath: 'id' })
        d.createObjectStore('meta')
      }
      if (oldVersion < 2) d.createObjectStore('pending', { keyPath: 'id' })
    },
  })
  return dbp
}

export async function getAllSongs(): Promise<Song[]> {
  return (await db()).getAll('songs')
}

export async function applyChanges(upserts: Song[], deletes: string[], lastSync: string) {
  const tx = (await db()).transaction(['songs', 'meta'], 'readwrite')
  const songs = tx.objectStore('songs')
  for (const s of upserts) songs.put(s)
  for (const id of deletes) songs.delete(id)
  tx.objectStore('meta').put(lastSync, 'lastSync')
  await tx.done
}

export async function getLastSync(): Promise<string | null> {
  return (await (await db()).get('meta', 'lastSync')) ?? null
}

/** 곡 캐시만 비운다(서버에서 전체 다시 받기). 올리지 않은 변경(pending)은 지우지 않는다 */
export async function clearAll() {
  const tx = (await db()).transaction(['songs', 'meta'], 'readwrite')
  await Promise.all([tx.objectStore('songs').clear(), tx.objectStore('meta').clear(), tx.done])
}

/** 단건 반영 — lastSync 는 건드리지 않음(그 사이 다른 기기 변경을 놓치지 않도록) */
export async function putSong(s: Song) {
  await (await db()).put('songs', s)
}

export async function removeSong(id: string) {
  await (await db()).delete('songs', id)
}

export async function getAllPending(): Promise<PendingSong[]> {
  return (await db()).getAll('pending')
}
export async function putPending(p: PendingSong) {
  await (await db()).put('pending', p)
}
export async function removePending(id: string) {
  await (await db()).delete('pending', id)
}
