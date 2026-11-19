/**
 * 곡 라이브러리: IndexedDB(이 기기) → 메모리 인덱스.
 *
 * 2026-11-19 사용자 결정 — "평소 저장은 이 기기, DB 는 버튼으로만":
 *  - 저장·삭제는 언제나 이 기기에만(pending). 콘티·검색에는 바로 쓰인다. 인터넷·로그인 불필요.
 *  - [⬇ 다운로드]: DB 와 이 기기를 통째로 비교한 목록(새 곡·수정·삭제, 어디가 다른지) → 골라 받기 / 전체 받기(이 기기를 DB 로 교체).
 *  - [⬆ 업로드]: 이 기기에서 바꾼 것 목록(중복·충돌 검사) → 골라 올리기. 전체 업로드(DB 를 이 기기로 교체)는 보류(위험).
 *  - 두 버튼은 들어갈 때 비밀번호 재확인(requireReauth, 5분 안이면 생략). 목록 화면 안에선 다시 묻지 않는다.
 *  - 비교 기준은 DB. 같은 곡을 이 기기와 DB 양쪽에서 바꿨으면 충돌 — 직접 고른다.
 * 화면에 보이는 곡 = 받아 둔 DB 곡(cache) + 이 기기의 새 곡·수정 − 이 기기에서 지운 곡.
 * 받아 둔 곡이 하나도 없는 기기(처음)는 로그인돼 있으면 확인할 때 전체를 바로 받는다(잃을 게 없으므로).
 */
import { shallowRef, ref, computed, watch } from 'vue'
import type { Song } from '@shared/types'
import { supabase } from '@/lib/supabase'
import { session } from '@/lib/auth'
import { uid } from '@/lib/uid'
import * as db from './db'
import type { PendingSong } from './db'
import { buildIndex, search, type IndexedSong } from './search'
import { classifyPending, pendingAsSong, diffIndex, type UploadItem, type RemoteRow, type RemoteKind } from './pending'

const PAGE = 1000 // PostgREST 기본 max-rows
const COLS = 'id,title,slides,source_file,updated_at,deleted_at'

/** 받아 둔 DB 곡(이 기기의 DB 사본) */
const serverSongs = shallowRef<Song[]>([])
/** 이 기기에서 바꾼 것 — 아직 DB 에 안 올라감 */
export const pending = shallowRef<PendingSong[]>([])
/** 화면용 */
const songs = shallowRef<Song[]>([])
const index = shallowRef<IndexedSong[]>([])
export const syncStatus = ref<'idle' | 'loading' | 'checking' | 'downloading' | 'error' | 'offline'>('idle')
export const syncError = ref<string | null>(null)
/** 마지막으로 DB 에서 받은 시각 */
export const lastSync = ref<string | null>(null)
/** 마지막으로 DB 와 비교한 시각 */
export const lastCheck = ref<string | null>(null)

/** 다운로드 목록 한 줄: DB 에서 바뀐 곡. mine = 이 기기에서도 바꿨으면(충돌) */
export interface RemoteItem { id: string; kind: RemoteKind; db: Song | null; local: Song | null; mine: PendingSong | null }
/** 마지막 비교 결과(DB 와 다른 곡) */
export const remoteItems = shallowRef<RemoteItem[]>([])

function rebuild() {
  const map = new Map(serverSongs.value.map((s) => [s.id, s]))
  for (const p of pending.value) {
    if (p.kind === 'delete') map.delete(p.id)
    else map.set(p.id, pendingAsSong(p, map.get(p.id)?.source_file ?? null))
  }
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

const canUseServer = () => !!supabase && !!session.value && navigator.onLine
function requireOnline() {
  if (!supabase || !session.value) throw new Error('로그인이 필요합니다')
  if (!navigator.onLine) throw new Error('인터넷 연결이 필요합니다')
  return supabase
}

async function fetchIndex(): Promise<RemoteRow[]> {
  const out: RemoteRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!.from('songs').select('id,updated_at,deleted_at').order('id').range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data as RemoteRow[]))
    if (!data || data.length < PAGE) break
  }
  return out
}
async function fetchSongs(ids: string[]): Promise<Song[]> {
  const out: Song[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase!.from('songs').select(COLS).in('id', ids.slice(i, i + 150))
    if (error) throw error
    out.push(...(data as Song[]))
  }
  return out
}
async function fetchAll(): Promise<Song[]> {
  const out: Song[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!.from('songs').select(COLS).is('deleted_at', null).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data as Song[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

let checking: Promise<void> | null = null
/**
 * DB 와 비교(가사 없는 목록만 받아 비교하고, 다른 곡만 가사까지 받음). 이 기기는 바꾸지 않는다 — 목록(remoteItems)만.
 * 처음 쓰는 기기(받은 곡·바꾼 것 모두 없음)면 바로 전체를 받는다.
 */
export function checkRemote(): Promise<void> {
  checking ??= doCheck().finally(() => { checking = null })
  return checking
}
async function doCheck() {
  await loadCache()
  if (!supabase || !session.value) return
  if (!navigator.onLine) { syncStatus.value = 'offline'; return }
  syncError.value = null
  try {
    if (!serverSongs.value.length && !pending.value.length) { await downloadAll(); return }
    syncStatus.value = 'checking'
    const diff = diffIndex(serverSongs.value, await fetchIndex())
    const full = new Map((await fetchSongs(diff.filter((d) => d.kind !== 'deleted').map((d) => d.id))).map((s) => [s.id, s]))
    const local = new Map(serverSongs.value.map((s) => [s.id, s]))
    const mine = new Map(pending.value.map((p) => [p.id, p]))
    remoteItems.value = diff.map((d) => ({ id: d.id, kind: d.kind, db: full.get(d.id) ?? null, local: local.get(d.id) ?? null, mine: mine.get(d.id) ?? null }))
    lastCheck.value = new Date().toISOString()
    syncStatus.value = 'idle'
  } catch (e) {
    syncStatus.value = 'error'
    syncError.value = (e as Error).message
  }
}

/** 로그인되면·다시 온라인 되면 비교(받지는 않음 — 숫자만 갱신) */
watch(session, (s) => { if (s) void checkRemote() })
window.addEventListener('online', () => void checkRemote())

/**
 * 골라 받기: 이 기기에 DB 버전을 반영. 이 기기에서도 바꾼 곡(충돌)을 받으면 이 기기 변경은 버린다.
 * 받지 않은 항목은 그대로 남아 다음 비교 때 다시 나온다.
 */
export async function applyDownload(ids: string[]) {
  const pick = new Set(ids)
  const items = remoteItems.value.filter((r) => pick.has(r.id))
  const map = new Map(serverSongs.value.map((s) => [s.id, s]))
  for (const r of items) {
    if (r.kind === 'deleted' || !r.db) { await db.removeSong(r.id); map.delete(r.id) }
    else { await db.putSong(r.db); map.set(r.id, r.db) }
    if (r.mine) await db.removePending(r.id)
  }
  const now = new Date().toISOString()
  await db.setLastSync(now)
  lastSync.value = now
  pending.value = pending.value.filter((p) => !items.some((r) => r.mine && r.id === p.id))
  setSongs([...map.values()])
  remoteItems.value = remoteItems.value.filter((r) => !pick.has(r.id))
}

/** 전체 받기: 이 기기의 곡·바꾼 내용(업로드 안 한 것 포함)을 모두 지우고 DB 곡으로 교체 */
export async function downloadAll() {
  requireOnline()
  syncStatus.value = 'downloading'
  syncError.value = null
  try {
    const all = await fetchAll()
    const now = new Date().toISOString()
    await db.replaceAll(all, now)
    lastSync.value = now
    lastCheck.value = now
    pending.value = []
    setSongs(all)
    remoteItems.value = []
    syncStatus.value = 'idle'
  } catch (e) {
    syncStatus.value = 'error'
    syncError.value = (e as Error).message
    throw e
  }
}

async function putServerSong(saved: Song) {
  await db.putSong(saved)
  serverSongs.value = [...serverSongs.value.filter((s) => s.id !== saved.id), saved]
}
async function dropServerSong(id: string) {
  await db.removeSong(id)
  serverSongs.value = serverSongs.value.filter((s) => s.id !== id)
}
async function dropPending(id: string) {
  await db.removePending(id)
  pending.value = pending.value.filter((p) => p.id !== id)
}

export const isLocalNewId = (id: string) => id.startsWith('local-')

export interface SaveResult { song: Song }
/** 고치기 시작할 때 본 DB 버전 */
export type SongBase = { updated_at: string; title: string; slides: string[] }

const baseOf = (s: Song | undefined): SongBase | null => (s ? { updated_at: s.updated_at, title: s.title, slides: [...s.slides] } : null)

/**
 * 새 곡(id 없음) 또는 수정 — 언제나 이 기기에(DB 는 업로드로만).
 * base = 고치기 시작할 때 본 DB 버전(편집기를 연 시점). 업로드 때 그 사이 DB 가 바뀌었는지 이걸로 판정한다.
 * 받아 둔 버전과 똑같이 되돌렸으면 바꾼 것이 없으므로 지운다.
 */
export async function saveSong(input: { id?: string; title: string; slides: string[]; base?: SongBase }): Promise<SaveResult> {
  const title = input.title.trim()
  if (!title) throw new Error('제목을 입력하세요')
  if (!input.slides.length) throw new Error('가사를 입력하세요')
  const prev = input.id ? pending.value.find((p) => p.id === input.id) : undefined
  const now = new Date().toISOString()
  let p: PendingSong
  if (!input.id || isLocalNewId(input.id)) {
    p = { id: input.id ?? `local-${uid()}`, kind: 'new', title, slides: [...input.slides], base: null, savedAt: now }
  } else {
    const cached = serverSongs.value.find((s) => s.id === input.id)
    const base = prev?.base ?? input.base ?? baseOf(cached)
    if (base && cached && base.updated_at === cached.updated_at && base.title === title && JSON.stringify(base.slides) === JSON.stringify(input.slides)) {
      await dropPending(input.id)
      rebuild()
      return { song: cached }
    }
    p = { id: input.id, kind: 'edit', title, slides: [...input.slides], base, savedAt: now }
  }
  await db.putPending(p)
  setPending([...pending.value.filter((x) => x.id !== p.id), p])
  return { song: songs.value.find((s) => s.id === p.id)! }
}

/** 삭제 — 이 기기에서만(목록에서 숨김). DB 에서 지우는 건 업로드로. 이 기기 새 곡은 그냥 지운다 */
export async function deleteSong(id: string) {
  if (isLocalNewId(id)) { await dropPending(id); rebuild(); return }
  const prev = pending.value.find((p) => p.id === id)
  const cached = serverSongs.value.find((s) => s.id === id)
  const shown = songs.value.find((s) => s.id === id)
  const p: PendingSong = { id, kind: 'delete', title: shown?.title ?? cached?.title ?? '', slides: [...(shown?.slides ?? cached?.slides ?? [])], base: prev?.base ?? baseOf(cached), savedAt: new Date().toISOString() }
  await db.putPending(p)
  setPending([...pending.value.filter((x) => x.id !== id), p])
}

// ── 업로드 ──────────────────────────────────────
export type { UploadItem }
/** add/overwrite/mine = 올림, delete = DB 에서 삭제, discard = 이 기기 변경 버림(받아 둔 버전으로) */
export type UploadAction = 'add' | 'overwrite' | 'mine' | 'delete' | 'discard'

/** DB 와 비교한 뒤(이 기기는 바꾸지 않음) 이 기기 변경을 하나씩 분류(중복·충돌) — 비교 기준은 지금 DB */
export async function prepareUpload(): Promise<{ items: UploadItem[]; error?: string }> {
  if (!supabase || !session.value) return { items: [], error: '로그인이 필요합니다' }
  if (!navigator.onLine) return { items: [], error: '인터넷 연결이 필요합니다' }
  await checkRemote()
  if (syncStatus.value === 'error') return { items: [], error: `DB 와 비교하지 못했습니다: ${syncError.value}` }
  // 지금 DB 모습 = 받아 둔 곡 + 아직 안 받은 DB 변경
  const view = new Map(serverSongs.value.map((s) => [s.id, s]))
  for (const r of remoteItems.value) { if (r.kind === 'deleted' || !r.db) view.delete(r.id); else view.set(r.id, r.db) }
  return { items: pending.value.map((p) => classifyPending(p, [...view.values()], pending.value)) }
}

/** 한 건 처리. 충돌 없는 수정·삭제는 '내가 본 DB 버전 그대로일 때만'(그 사이 바뀌면 오류 → 다시 비교) */
export async function uploadOne(item: UploadItem, action: UploadAction, targetId?: string): Promise<void> {
  const sb = requireOnline()
  const p = item.p
  const guard = !item.conflict && p.base ? p.base.updated_at : null
  if (action === 'discard') {
    await dropPending(p.id)
  } else if (action === 'delete') {
    if (item.server) {
      let q = sb.from('songs').update({ deleted_at: new Date().toISOString() }).eq('id', p.id).is('deleted_at', null)
      if (guard) q = q.eq('updated_at', guard)
      const { data, error } = await q.select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('그 사이 DB 에서 바뀌었습니다 — 다시 열어 비교하세요')
    }
    await dropServerSong(p.id)
    await dropPending(p.id)
  } else {
    const row = { title: p.title, slides: p.slides }
    const id = action === 'overwrite' ? targetId : action === 'mine' ? p.id : undefined
    if (action === 'overwrite' && !id) throw new Error('덮어쓸 곡이 없습니다')
    let saved: Song
    if (id) {
      let q = sb.from('songs').update({ ...row, deleted_at: null }).eq('id', id)
      if (action === 'mine' && guard) q = q.eq('updated_at', guard)
      const { data, error } = await q.select(COLS)
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('그 사이 DB 에서 바뀌었습니다 — 다시 열어 비교하세요')
      saved = data[0] as Song
    } else {
      const { data, error } = await sb.from('songs').insert(row).select(COLS).single()
      if (error) throw new Error(error.message)
      saved = data as Song
    }
    await dropPending(p.id)
    await putServerSong(saved)
  }
  remoteItems.value = remoteItems.value.filter((r) => r.id !== p.id && r.id !== targetId)
  rebuild()
}

export function useLibrary() {
  return {
    songs,
    count: computed(() => songs.value.length),
    byId: computed(() => new Map(songs.value.map((x) => [x.id, x]))),
    /** 이 기기 변경 상태: 'new' = 이 기기 새 곡, 'edit' = 이 기기에서 고침(둘 다 아직 DB 에 안 올라감) */
    localKind: computed(() => new Map(pending.value.map((p) => [p.id, p.kind]))),
    /** 올릴 것(이 기기 변경) 개수 */
    pendingCount: computed(() => pending.value.length),
    /** 받을 것(DB 와 다른 곡) 개수 — 마지막 비교 기준 */
    remoteCount: computed(() => remoteItems.value.length),
    search: (q: string, limit?: number) => search(index.value, q, limit),
  }
}

/** 화면이 DB 와 주고받을 수 있는 상태인지(로그인·온라인) */
export const canSync = canUseServer
