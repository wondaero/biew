import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Song } from '@shared/types'

interface BiewDB extends DBSchema {
  songs: { key: string; value: Song }
  meta: { key: string; value: string }
}

let dbp: Promise<IDBPDatabase<BiewDB>> | null = null
function db() {
  dbp ??= openDB<BiewDB>('biew', 1, {
    upgrade(d) {
      d.createObjectStore('songs', { keyPath: 'id' })
      d.createObjectStore('meta')
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

export async function clearAll() {
  const tx = (await db()).transaction(['songs', 'meta'], 'readwrite')
  await Promise.all([tx.objectStore('songs').clear(), tx.objectStore('meta').clear(), tx.done])
}
