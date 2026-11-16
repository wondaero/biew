/**
 * 곡 라이브러리: IndexedDB 캐시 → 메모리 인덱스.
 * 온라인 + 로그인 상태면 updated_at 델타만 받아온다(deleted_at 으로 삭제 반영).
 */
import { shallowRef, ref, computed, watch } from 'vue'
import type { Song } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { session } from '@/lib/auth'
import * as db from './db'
import { buildIndex, search, type IndexedSong } from './search'

const PAGE = 1000 // PostgREST 기본 max-rows
const COLS = 'id,title,slides,source_file,updated_at,deleted_at'

const songs = shallowRef<Song[]>([])
const index = shallowRef<IndexedSong[]>([])
export const syncStatus = ref<'idle' | 'loading' | 'syncing' | 'error' | 'offline'>('idle')
export const syncError = ref<string | null>(null)
export const lastSync = ref<string | null>(null)

function setSongs(list: Song[]) {
  list = list.filter((s) => !s.deleted_at)
  songs.value = list
  index.value = buildIndex(list)
}

let loaded: Promise<void> | null = null
export function loadCache() {
  loaded ??= (async () => {
    syncStatus.value = 'loading'
    setSongs(await db.getAllSongs())
    lastSync.value = await db.getLastSync()
    syncStatus.value = 'idle'
  })()
  return loaded
}

let running: Promise<void> | null = null
export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => { running = null })
  return running
}

async function doSync() {
  await loadCache()
  if (!supabase || !session.value) return
  if (!navigator.onLine) { syncStatus.value = 'offline'; return }
  syncStatus.value = 'syncing'
  syncError.value = null
  try {
    const since = lastSync.value
    const changed: Song[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('songs').select(COLS).order('updated_at').order('id').range(from, from + PAGE - 1)
      // gte(이상): 같은 timestamp 의 행을 놓치지 않도록. 재적용은 멱등.
      if (since) q = q.gte('updated_at', since)
      const { data, error } = await q
      if (error) throw error
      changed.push(...(data as Song[]))
      if (!data || data.length < PAGE) break
    }
    if (changed.length) {
      const maxTs = changed.reduce((m, s) => (s.updated_at > m ? s.updated_at : m), since ?? '')
      const deletes = changed.filter((s) => s.deleted_at).map((s) => s.id)
      const ups = changed.filter((s) => !s.deleted_at)
      await db.applyChanges(ups, deletes, maxTs)
      lastSync.value = maxTs
      const map = new Map(songs.value.map((s) => [s.id, s]))
      for (const s of ups) map.set(s.id, s)
      for (const id of deletes) map.delete(id)
      setSongs([...map.values()])
    }
    syncStatus.value = 'idle'
  } catch (e) {
    syncStatus.value = 'error'
    syncError.value = (e as Error).message
  }
}

/** 로그인되면 자동 동기화, 다시 온라인 되면 재시도 */
watch(session, (s) => { if (s) syncNow() })
window.addEventListener('online', () => syncNow())

export async function resetCache() {
  await db.clearAll()
  lastSync.value = null
  setSongs([])
  await syncNow()
}

function requireOnline() {
  if (!supabase || !session.value) throw new Error('로그인이 필요합니다')
  if (!navigator.onLine) throw new Error('인터넷 연결이 필요합니다 (곡 저장은 온라인에서만 가능)')
  return supabase
}

function applyLocal(song: Song | null, removedId?: string) {
  const map = new Map(songs.value.map((x) => [x.id, x]))
  if (song) map.set(song.id, song)
  if (removedId) map.delete(removedId)
  setSongs([...map.values()])
}

/** 새 곡(id 없음) 또는 수정. 저장된 행을 돌려준다. */
export async function saveSong(input: { id?: string; title: string; slides: string[] }): Promise<Song> {
  const sb = requireOnline()
  const title = input.title.trim()
  if (!title) throw new Error('제목을 입력하세요')
  if (!input.slides.length) throw new Error('가사를 입력하세요')
  const row = { title, slides: input.slides }
  const q = input.id ? sb.from('songs').update(row).eq('id', input.id) : sb.from('songs').insert(row)
  const { data, error } = await q.select(COLS).single()
  if (error) throw new Error(error.message)
  const saved = data as Song
  await db.putSong(saved)
  applyLocal(saved)
  return saved
}

/** 소프트 삭제(deleted_at). 다른 기기는 다음 동기화 때 목록에서 사라진다. */
export async function deleteSong(id: string) {
  const sb = requireOnline()
  const { error } = await sb.from('songs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  await db.removeSong(id)
  applyLocal(null, id)
}

export function useLibrary() {
  return {
    songs,
    count: computed(() => songs.value.length),
    byId: computed(() => new Map(songs.value.map((x) => [x.id, x]))),
    search: (q: string, limit?: number) => search(index.value, q, limit),
  }
}
