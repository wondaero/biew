import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { ref } from 'vue'
import type { Song } from '@shared/types'

/**
 * 저장소 구조 업그레이드 안내.
 * IndexedDB 는 같은 PC 의 다른 창이 옛 버전으로 열고 있으면, 그 창이 닫힐 때까지 업그레이드가 '멈춰서 기다린다'.
 *  - blocked : 이 창(새 버전)이 옛 창 때문에 기다리는 중 → 사용자에게 옛 창을 닫으라고 안내(닫히면 자동으로 이어짐)
 *  - blocking: 이 창이 다른 창(더 새 버전)의 업그레이드를 막는 중 → 연결을 스스로 닫아 길을 비켜 준다
 * 송출(컨트롤러↔출력 창)은 IndexedDB 를 쓰지 않으므로 어느 경우에도 송출은 멈추지 않는다.
 */
export const dbNotice = ref<string | null>(null)

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
    blocked() {
      dbNotice.value = '다른 Biew 창(옛 버전)이 열려 있어 곡 목록을 불러오지 못하고 있습니다. 다른 Biew 창을 닫거나 새로고침하면 바로 이어집니다. (송출은 영향 없음)'
    },
    blocking() {
      // 더 새 버전이 다른 창에서 열림 → 이 창의 연결을 닫아 그쪽 업그레이드를 막지 않는다
      void dbp?.then((d) => d.close())
      dbp = null
      dbNotice.value = '다른 창에서 새 버전이 열렸습니다. 이 창을 새로고침해 주세요. (송출은 영향 없음)'
    },
  }).then((d) => {
    if (dbNotice.value?.startsWith('다른 Biew 창')) dbNotice.value = null // 기다리던 업그레이드가 끝남
    return d
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
