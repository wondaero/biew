/**
 * 인터넷 송출 호스트 PC → 서버로 그림 올리기(마이그레이션 20261123000000_channel_media, 2026-11-23 사용자 결정).
 *  - 선곡에 그림 묶음이 있을 때만 올린다(없으면 서버에 아무것도 안 생김).
 *  - 선곡 항목마다 따로(같은 그림인지 따지지 않음). 선곡에서 빠진 항목은 바로 서버에서 지운다.
 *  - 장마다 작은 그림(리모컨용, 먼저) → 큰 그림(보기용). 다 올리면 리모컨·보기에 알림(media-ready) → 그쪽이 받는다.
 *  - 인터넷이 끊기면 멈췄다가 다시 연결되면 이어서(15초마다·상태가 바뀔 때마다 확인). PC 송출은 이와 무관.
 *  - 이 PC 에 그림이 없으면(다른 PC 가 넣은 것) 올리지 않는다 — 그 PC 가 올린다.
 */
import { ref } from 'vue'
import type { LiveState } from '@shared/types'
import { isMediaSlide, mediaIdOf } from '@shared/media'
import { supabase } from '@/lib/supabase'
import { getMedia } from '@/library/db'
import { loadHost } from '@/live/persistence'

/** 사이드바 표시: 올리는 중 n/m, 또는 멈춤(인터넷 등) */
export const mediaUpload = ref<{ done: number; total: number; error?: string } | null>(null)

const THUMB_W = 480
const THUMB_H = 270

let code: string | null = null
let getState: (() => LiveState) | null = null
let notify: (() => void) | null = null
let timer: number | undefined
let kickTimer: number | undefined
let gen = 0
/** 서버에 있는 것: `${key}:${idx}:${variant}` → media_id. null = 아직 모름(목록부터 읽음) */
let have: Map<string, string> | null = null
let running = false
let again = false

export function hostMediaStart(c: string, opts: { getState: () => LiveState; notify: () => void }) {
  hostMediaStop()
  code = c
  getState = opts.getState
  notify = opts.notify
  timer = window.setInterval(() => kick(0), 15000)
}

export function hostMediaStop() {
  gen++
  clearInterval(timer); clearTimeout(kickTimer)
  code = null; getState = null; notify = null; have = null
  mediaUpload.value = null
}

/** 다시 연결됐을 때: 서버 목록부터 다시 읽는다. 진행 중인 올리기는 gen 으로 멈춘다(have 를 비운 채 이어 쓰다 오류 나지 않게) */
export function hostMediaReconnect() {
  gen++
  have = null
  skipped.clear()
  kick(0)
}
/** 이번 연결에서 올릴 수 없는 것(이 PC 에 없음·서버가 거부: 너무 큼·잘못된 그림) — 매번 다시 시도해 뒤 그림을 막지 않게 */
const skipped = new Set<string>()

/** 상태가 바뀌면(선곡에 그림 추가·빼기) — 잠깐 모아서 한 번 */
export function hostMediaKick() { kick(400) }

function kick(delay: number) {
  if (!code) return
  clearTimeout(kickTimer)
  kickTimer = window.setTimeout(() => { if (running) again = true; else void run() }, delay)
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: boolean }> {
  if (!supabase) return { data: null, error: true }
  const { data, error } = await supabase.rpc(fn, args)
  return { data: (data as T) ?? null, error: !!error }
}

async function run() {
  const c = code
  const my = gen
  const token = c ? loadHost(c)?.token : null
  const st = getState?.()
  if (!c || !token || !st || !navigator.onLine) return
  running = true
  try {
    const items = st.setlist.filter((it) => it.slides.some(isMediaSlide))
    // 그림이 하나도 없고 서버에도 없다고 알고 있으면 아무것도 안 한다(서버 호출 없음)
    if (!items.length && have && !have.size) { mediaUpload.value = null; return }

    if (!have) {
      const r = await rpc<{ status: string; item_key: string | null; idx: number | null; variant: string | null; media_id: string | null }[]>('host_media_list', { p_code: c, p_token: token })
      if (my !== gen) return
      if (r.error || r.data?.[0]?.status !== 'ok') { if (items.length) mediaUpload.value = { done: 0, total: 0, error: '서버 연결 대기' }; return }
      have = new Map(r.data.filter((x) => x.item_key).map((x) => [`${x.item_key}:${x.idx}:${x.variant}`, x.media_id!]))
    }

    // 선곡에서 빠진 항목은 서버에서 바로 지운다
    const keep = new Set(items.map((it) => it.key))
    if ([...have.keys()].some((k) => !keep.has(k.slice(0, k.indexOf(':'))))) {
      const r = await rpc<number>('host_prune_media', { p_code: c, p_token: token, p_keep: [...keep] })
      if (my !== gen) return
      if (r.error || (r.data ?? -1) < 0) return
      for (const k of [...have.keys()]) if (!keep.has(k.slice(0, k.indexOf(':')))) have.delete(k)
    }

    // 올릴 것: 작은 그림 전부 먼저(리모컨이 빨리 보이게) → 큰 그림
    type Task = { key: string; idx: number; variant: 'thumb' | 'full'; id: string }
    const all: Task[] = []
    for (const variant of ['thumb', 'full'] as const) {
      for (const it of items) it.slides.forEach((s, idx) => { if (isMediaSlide(s)) all.push({ key: it.key, idx, variant, id: mediaIdOf(s) }) })
    }
    const haveNow = have
    const todo = all.filter((t) => haveNow.get(`${t.key}:${t.idx}:${t.variant}`) !== t.id && !skipped.has(`${t.key}:${t.idx}:${t.variant}:${t.id}`))
    if (!todo.length) { mediaUpload.value = skipped.size ? { done: all.length - skipped.size, total: all.length, error: '일부 그림은 올릴 수 없음(이 PC 에 없거나 너무 큼)' } : null; return }

    let done = all.length - todo.length
    let sinceNotify = 0
    let uploaded = 0
    mediaUpload.value = { done, total: all.length }
    for (const t of todo) {
      if (my !== gen) return
      const m = await getMedia(t.id).catch(() => undefined)
      if (!m) { skipped.add(`${t.key}:${t.idx}:${t.variant}:${t.id}`); done++; continue } // 이 PC 에 없음 — 넣은 PC 가 올린다(다시 시도 안 함)
      const blob = t.variant === 'full' ? m.blob : await makeThumb(m.blob)
      const r = await rpc<string>('host_put_media', {
        p_code: c, p_token: token, p_key: t.key, p_idx: t.idx, p_variant: t.variant, p_media_id: t.id, p_data: await blobToBase64(blob),
      })
      if (my !== gen) return
      if (r.data === 'ok') {
        haveNow.set(`${t.key}:${t.idx}:${t.variant}`, t.id)
        uploaded++
        done++
        mediaUpload.value = { done, total: all.length }
        // 작은 그림이 다 올라갔을 때·10장마다 알림 — 리모컨·보기가 기다리지 않게
        if (++sinceNotify >= 10 || (t.variant === 'thumb' && todo[todo.indexOf(t) + 1]?.variant !== 'thumb')) { sinceNotify = 0; notify?.() }
      } else if (r.data === 'too_big' || r.data === 'invalid') {
        // 이 장은 다시 보내도 안 된다 — 건너뛰고 다음 장(예전엔 여기서 멈춰 뒤 그림이 전부 못 올라가고 같은 파일을 15초마다 다시 보냈음)
        skipped.add(`${t.key}:${t.idx}:${t.variant}:${t.id}`)
        done++
        mediaUpload.value = { done, total: all.length, error: '그림 한 장이 너무 커서 건너뜀' }
      } else {
        const why = r.data === 'quota' ? '서버 용량 한도(채널당 200MB)' : r.data === 'token_rejected' ? '호스트 권한 확인 필요' : '인터넷 연결 대기'
        mediaUpload.value = { done, total: all.length, error: why }
        if (uploaded) notify?.()
        return // 15초 뒤 다시(인터넷 회복 등)
      }
    }
    // 실제로 올린 게 있을 때만 알림 — 없는데 알리면 모든 폰이 15초마다 없는 그림을 다시 찾음
    if (uploaded) notify?.()
    mediaUpload.value = skipped.size ? { done: all.length - skipped.size, total: all.length, error: '일부 그림은 올릴 수 없음(이 PC 에 없거나 너무 큼)' } : null
  } finally {
    running = false
    if (again) { again = false; kick(0) }
  }
}

async function makeThumb(full: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(full)
  const s = Math.min(1, THUMB_W / bmp.width, THUMB_H / bmp.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * s))
  c.height = Math.max(1, Math.round(bmp.height * s))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise<Blob>((res) => c.toBlob((b) => res(b ?? full), 'image/webp', 0.8))
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
}
