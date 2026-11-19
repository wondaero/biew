/**
 * 곡 라이브러리: IndexedDB 캐시 → 메모리 인덱스.
 * 온라인 + 로그인 상태면 updated_at 델타만 받아온다(deleted_at 으로 삭제 반영).
 *
 * 화면에 보이는 곡 = 서버에서 받은 곡(캐시) + PC 에서 고치거나 새로 등록한 곡(pending, 아직 서버에 안 올라감).
 *  - 오프라인이거나 로그인 안 한 상태에서 저장하면 pending 에 들어가고, 콘티·검색·'↻ 최신'에 바로 쓰인다.
 *  - '서버에 올리기'(prepareUpload → uploadOne)에서 중복·충돌을 검사한 뒤 올리고 pending 에서 지운다.
 *  - 삭제는 온라인에서만(아직 안 올린 PC 새 곡은 오프라인에서도 지울 수 있음).
 */
import { shallowRef, ref, computed, watch } from 'vue'
import type { Song } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { session } from '@/lib/auth'
import { uid } from '@/lib/uid'
import * as db from './db'
import type { PendingSong } from './db'
import { buildIndex, search, type IndexedSong } from './search'
import { classifyPending, pendingAsSong, type UploadItem } from './pending'

const PAGE = 1000 // PostgREST 기본 max-rows
const COLS = 'id,title,slides,source_file,updated_at,deleted_at'

/** 서버에서 받은 곡(캐시) */
const serverSongs = shallowRef<Song[]>([])
/** PC 변경 — 아직 서버에 안 올라감 */
export const pending = shallowRef<PendingSong[]>([])
/** 화면용: 서버 곡 + PC 변경 */
const songs = shallowRef<Song[]>([])
const index = shallowRef<IndexedSong[]>([])
export const syncStatus = ref<'idle' | 'loading' | 'syncing' | 'error' | 'offline'>('idle')
export const syncError = ref<string | null>(null)
export const lastSync = ref<string | null>(null)

function rebuild() {
  const map = new Map(serverSongs.value.map((s) => [s.id, s]))
  for (const p of pending.value) map.set(p.id, pendingAsSong(p, map.get(p.id)?.source_file ?? null))
  songs.value = [...map.values()]
  index.value = buildIndex(songs.value)
}

function setSongs(list: Song[]) {
  serverSongs.value = list.filter((s) => !s.deleted_at)
  rebuild()
}

function setPending(list: PendingSong[]) {
  pending.value = list
  rebuild()
}

let loaded: Promise<void> | null = null
export function loadCache() {
  loaded ??= (async () => {
    syncStatus.value = 'loading'
    serverSongs.value = (await db.getAllSongs()).filter((s) => !s.deleted_at)
    setPending(await db.getAllPending())
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
      const map = new Map(serverSongs.value.map((s) => [s.id, s]))
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

/** 곡 캐시를 지우고 전체 다시 받기. 올리지 않은 PC 변경은 그대로 둔다 */
export async function resetCache() {
  await db.clearAll()
  lastSync.value = null
  setSongs([])
  await syncNow()
}

const canUseServer = () => !!supabase && !!session.value && navigator.onLine

function requireOnline() {
  if (!supabase || !session.value) throw new Error('로그인이 필요합니다')
  if (!navigator.onLine) throw new Error('인터넷 연결이 필요합니다')
  return supabase
}

async function putServerSong(saved: Song) {
  await db.putSong(saved)
  serverSongs.value = [...serverSongs.value.filter((s) => s.id !== saved.id), saved]
}

async function dropPending(id: string) {
  await db.removePending(id)
  pending.value = pending.value.filter((p) => p.id !== id)
}

export const isLocalNewId = (id: string) => id.startsWith('local-')

/** conflict: 서버에 바로 저장하려 했는데 그 사이 서버 곡이 바뀌었거나 지워져서 PC 에 저장함('서버에 올리기'에서 비교) */
export interface SaveResult { song: Song; local: boolean; conflict?: boolean }
/** 고치기 시작할 때 본 서버 버전 */
export type SongBase = { updated_at: string; title: string; slides: string[] }

/**
 * 새 곡(id 없음) 또는 수정.
 * 온라인 + 로그인이면 바로 서버에 저장. 아니면 PC 에 저장(pending) → 나중에 '서버에 올리기'.
 * 이미 PC 에만 있는 변경(아직 안 올린 새 곡/수정)이 있는 곡은 온라인이어도 PC 에 이어서 저장한다
 * — 그 변경은 '서버에 올리기'에서 충돌 검사를 거쳐야 하므로.
 *
 * 수정을 서버에 바로 저장할 때도 충돌 검사(2026-11-19): base(고치기 시작할 때 본 서버 버전 — 없으면 캐시)의 updated_at 과
 * 지금 서버가 같을 때만 저장(조건부 update). 그 사이 다른 기기가 고쳤거나 지웠으면 덮어쓰지 않고 PC 에 저장 → '서버에 올리기'에서
 * 양쪽 가사를 비교해 고른다(예전엔 소리 없이 덮어써서 다른 PC 의 수정이 사라질 수 있었음).
 */
export async function saveSong(input: { id?: string; title: string; slides: string[]; base?: SongBase }): Promise<SaveResult> {
  const title = input.title.trim()
  if (!title) throw new Error('제목을 입력하세요')
  if (!input.slides.length) throw new Error('가사를 입력하세요')
  const prev = input.id ? pending.value.find((p) => p.id === input.id) : undefined
  const localNew = !!input.id && isLocalNewId(input.id)

  const cached = input.id ? serverSongs.value.find((s) => s.id === input.id) : undefined
  const seen: SongBase | null = input.base ?? (cached ? { updated_at: cached.updated_at, title: cached.title, slides: [...cached.slides] } : null)
  let conflict = false
  if (canUseServer() && !prev && !localNew) {
    const row = { title, slides: input.slides }
    if (!input.id) {
      const { data, error } = await supabase!.from('songs').insert(row).select(COLS).single()
      if (error) throw new Error(error.message)
      await putServerSong(data as Song)
      rebuild()
      return { song: data as Song, local: false }
    }
    let q = supabase!.from('songs').update(row).eq('id', input.id).is('deleted_at', null)
    if (seen) q = q.eq('updated_at', seen.updated_at) // 내가 본 버전 그대로일 때만
    const { data, error } = await q.select(COLS)
    if (error) throw new Error(error.message)
    if (data?.length) {
      await putServerSong(data[0] as Song)
      rebuild()
      return { song: data[0] as Song, local: false }
    }
    // 0건 = 그 사이 서버 곡이 바뀌었거나 지워짐 → 덮어쓰지 않고 PC 에 저장(아래). 최신 서버 버전은 받아 둔다(올리기 비교용)
    conflict = true
    void syncNow()
  }

  // PC 에 저장
  const now = new Date().toISOString()
  let p: PendingSong
  if (!input.id || localNew) {
    p = { id: input.id ?? `local-${uid()}`, kind: 'new', title, slides: [...input.slides], base: null, savedAt: now }
  } else {
    const server = cached
    // 기준 = 고치기 시작할 때 본 버전(충돌이면 반드시 그것 — 캐시는 동기화로 이미 새 버전일 수 있음)
    const base = prev?.base ?? seen
    // 서버 버전과 똑같이 되돌렸으면 올릴 것이 없다
    if (base && base.title === title && JSON.stringify(base.slides) === JSON.stringify(input.slides)) {
      await dropPending(input.id)
      rebuild()
      return { song: server ?? pendingAsSong({ id: input.id, kind: 'edit', title, slides: input.slides, base, savedAt: now }), local: false }
    }
    p = { id: input.id, kind: 'edit', title, slides: [...input.slides], base, savedAt: now }
  }
  await db.putPending(p)
  setPending([...pending.value.filter((x) => x.id !== p.id), p])
  return { song: songs.value.find((s) => s.id === p.id)!, local: true, conflict }
}

/** 소프트 삭제(deleted_at) — 온라인에서만. 아직 안 올린 PC 새 곡은 PC 에서만 지운다 */
export async function deleteSong(id: string) {
  if (isLocalNewId(id)) {
    await dropPending(id)
    rebuild()
    return
  }
  const sb = requireOnline()
  const { error } = await sb.from('songs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  await db.removeSong(id)
  await dropPending(id) // 올리지 않은 수정이 있었다면 함께 버림
  serverSongs.value = serverSongs.value.filter((s) => s.id !== id)
  rebuild()
}

// ── 서버에 올리기 ──────────────────────────────────────
export type { UploadItem }
export type UploadAction = 'add' | 'overwrite' | 'mine' | 'discard'

/** 서버 최신 곡을 먼저 받은 뒤 PC 변경을 하나씩 분류(중복·충돌) */
export async function prepareUpload(): Promise<{ items: UploadItem[]; error?: string }> {
  if (!supabase || !session.value) return { items: [], error: '로그인이 필요합니다' }
  if (!navigator.onLine) return { items: [], error: '인터넷 연결이 필요합니다' }
  await syncNow()
  if (syncStatus.value === 'error') return { items: [], error: `서버 곡을 받지 못했습니다: ${syncError.value}` }
  return { items: pending.value.map((p) => classifyPending(p, serverSongs.value, pending.value)) }
}

/**
 * 한 건 처리.
 *  add      : 새 곡으로 추가(서버에서 지워진 곡을 다시 올릴 때도)
 *  overwrite: targetId 서버 곡에 덮어쓰기(새 곡이 기존 곡과 중복일 때)
 *  mine     : 내 수정으로 서버 곡 덮어쓰기
 *  discard  : 올리지 않고 PC 변경을 버림(서버 것 유지)
 */
export async function uploadOne(item: UploadItem, action: UploadAction, targetId?: string): Promise<void> {
  const sb = requireOnline()
  const row = { title: item.p.title, slides: item.p.slides }
  let saved: Song | null = null
  if (action === 'add' || action === 'overwrite' || action === 'mine') {
    const id = action === 'overwrite' ? targetId : action === 'mine' ? item.p.id : undefined
    if (action === 'overwrite' && !id) throw new Error('덮어쓸 곡이 없습니다')
    const q = id ? sb.from('songs').update(row).eq('id', id) : sb.from('songs').insert(row)
    const { data, error } = await q.select(COLS).single()
    if (error) throw new Error(error.message)
    saved = data as Song
  }
  await dropPending(item.p.id)
  if (saved) await putServerSong(saved)
  rebuild()
}

export function useLibrary() {
  return {
    songs,
    count: computed(() => songs.value.length),
    byId: computed(() => new Map(songs.value.map((x) => [x.id, x]))),
    /** PC 변경 상태: 'new' = PC 에서 새로 등록, 'edit' = PC 에서 고침(둘 다 아직 서버에 안 올라감) */
    localKind: computed(() => new Map(pending.value.map((p) => [p.id, p.kind]))),
    pendingCount: computed(() => pending.value.length),
    search: (q: string, limit?: number) => search(index.value, q, limit),
  }
}
