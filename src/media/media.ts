/**
 * 그림 슬라이드 만들기·꺼내기·정리(shared/media.ts 설명 참고). 모두 이 기기 안에서 — 서버·인터넷 불필요.
 *  - PDF: pdf.js 로 장마다 그림(처음 쓸 때만 불러옴, PWA 에 포함되어 오프라인도 됨)
 *  - 이미지: 여러 장(이름 순 — PowerPoint '모든 슬라이드 내보내기' 순서)
 *  - .ppt/.pptx: 브라우저가 정확히 그릴 수 없다(글꼴·도형이 틀어짐) → PowerPoint 에서 PDF 로 저장하라고 안내
 */
import { ref } from 'vue'
import { putMedia, getMedia, allMediaIds, removeMedia, allHistorySetlists } from '@/library/db'
import { mediaSlide, naturalCompare, referencedMedia, isMediaSlide, mediaIdOf } from '@shared/media'
import { uid } from '@/lib/uid'
import { supabase } from '@/lib/supabase'
import { getToken } from '@/channel/api'
import { loadHost } from '@/live/persistence'

/** 송출 해상도 상자. 이보다 크면 줄인다(그림 크기·메모리 절약), 작으면 그대로 */
const BOX_W = 1920
const BOX_H = 1080
export const MAX_PAGES = 300

export class MediaImportError extends Error {}

export interface ImportProgress { done: number; total: number }
export interface ImportResult { title: string; slides: string[] }

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
const isPpt = (f: File) => /\.(pptx?|ppsx?|key|odp)$/i.test(f.name)
const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)
const baseName = (n: string) => n.replace(/\.[^.]+$/, '')

/** 파일들 → 그림 장들(이 기기에 저장). 취소하면 signal.aborted */
export async function importFiles(files: File[], onProgress: (p: ImportProgress) => void, signal?: AbortSignal): Promise<ImportResult> {
  if (!files.length) throw new MediaImportError('파일을 고르세요')
  if (files.some(isPpt)) {
    throw new MediaImportError('PPT 파일은 바로 넣을 수 없습니다 — PowerPoint 에서 [파일 → 내보내기 → PDF] 로 저장한 뒤 그 PDF 를 넣으세요.')
  }
  const pdfs = files.filter(isPdf)
  if (pdfs.length > 1) throw new MediaImportError('PDF 는 한 번에 하나씩 넣으세요')
  if (pdfs.length === 1) {
    if (files.length > 1) throw new MediaImportError('PDF 와 이미지를 섞지 말고 따로 넣으세요')
    return { title: baseName(pdfs[0]!.name), slides: await importPdf(pdfs[0]!, onProgress, signal) }
  }
  const images = files.filter(isImage).sort((a, b) => naturalCompare(a.name, b.name))
  if (images.length !== files.length) throw new MediaImportError('PDF 또는 그림 파일(PNG·JPG)만 넣을 수 있습니다')
  if (images.length > MAX_PAGES) throw new MediaImportError(`한 번에 ${MAX_PAGES}장까지 넣을 수 있습니다`)
  const slides: string[] = []
  onProgress({ done: 0, total: images.length })
  for (const f of images) {
    if (signal?.aborted) throw new DOMException('취소', 'AbortError')
    const bmp = await createImageBitmap(f).catch(() => { throw new MediaImportError(`그림을 읽을 수 없습니다: ${f.name}`) })
    slides.push(await store(bmp, bmp.width, bmp.height, f))
    bmp.close()
    onProgress({ done: slides.length, total: images.length })
  }
  return { title: images.length === 1 ? baseName(images[0]!.name) : `${baseName(images[0]!.name).replace(/[\s_-]*\d+$/, '') || '그림'} (${images.length}장)`, slides }
}

async function importPdf(file: File, onProgress: (p: ImportProgress) => void, signal?: AbortSignal): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise
  } catch (e) {
    throw new MediaImportError((e as { name?: string })?.name === 'PasswordException' ? '암호가 걸린 PDF 는 넣을 수 없습니다' : 'PDF 를 열 수 없습니다(손상된 파일일 수 있음)')
  }
  try {
    if (doc.numPages > MAX_PAGES) throw new MediaImportError(`${MAX_PAGES}장이 넘는 PDF 는 넣을 수 없습니다(${doc.numPages}장)`)
    const slides: string[] = []
    onProgress({ done: 0, total: doc.numPages })
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException('취소', 'AbortError')
      const page = await doc.getPage(n)
      const v1 = page.getViewport({ scale: 1 })
      const scale = Math.min(BOX_W / v1.width, BOX_H / v1.height)
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff' // PDF 는 투명 배경 — PowerPoint 화면처럼 흰 바탕(배경을 넣은 슬라이드는 그대로 덮임)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      page.cleanup()
      slides.push(await storeCanvas(canvas))
      canvas.width = canvas.height = 0 // 메모리 바로 반납(장이 많을 때)
      onProgress({ done: n, total: doc.numPages })
    }
    return slides
  } finally {
    void doc.destroy()
  }
}

/** 상자보다 크면 줄여서, 아니면 원본 파일 그대로 저장 */
async function store(src: ImageBitmap, w: number, h: number, original: Blob): Promise<string> {
  const s = Math.min(1, BOX_W / w, BOX_H / h)
  if (s === 1) return save(original, w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * s)
  canvas.height = Math.round(h * s)
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height)
  return storeCanvas(canvas)
}

async function storeCanvas(c: HTMLCanvasElement): Promise<string> {
  // webp 를 못 만드는 브라우저는 png 로 돌려준다(타입 확인 불필요 — 어느 쪽이든 그대로 그린다)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new MediaImportError('그림 변환 실패'))), 'image/webp', 0.92))
  return save(blob, c.width, c.height)
}

/** 내용 해시를 id 로(같은 그림은 한 번만 저장 — 같은 PDF 를 다시 넣어도 늘지 않음). http(LAN)라 해시를 못 쓰면 임의 id */
async function save(blob: Blob, w: number, h: number): Promise<string> {
  let id: string
  try {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
    id = [...d.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    id = uid().replace(/-/g, '')
  }
  await putMedia({ id, blob, w, h, savedAt: new Date().toISOString() })
  urls.delete(`${id}:full`); urls.delete(`${id}:thumb`) // 예전에 '없음'으로 기억했으면 다시 찾게
  return mediaSlide(id)
}

// ── 그리기: id → 이 창에서 쓸 주소(object URL). 같은 그림은 한 번만 꺼낸다 ──
/**
 * 인터넷 송출 채널에서 이 기기에 없는 그림을 서버(channel_media)에서 받을 곳. 없으면(로컬 송출) 이 기기 것만.
 *  - 리모컨 = 작은 그림(thumb), 보기·호스트 PC = 큰 그림(full)
 *  - persist: 받은 그림을 이 기기에 저장(호스트 PC 만 — 출력 창이 읽고, 인터넷이 끊겨도 송출되게).
 *    폰(리모컨·보기)은 저장하지 않는다(사용자 결정 — 열 때마다 받음, 기기에 쌓이지 않음)
 */
export interface MediaSource { code: string; kind: 'host' | 'control' | 'view'; variant: 'full' | 'thumb'; persist: boolean }
let source: MediaSource | null = null
/** 새 그림을 받을 수 있게 됐다는 신호(호스트가 다 올림 · 소스 바뀜) — 못 찾았던 그림을 다시 찾게 */
export const mediaTick = ref(0)
/** 받는 중 표시(리모컨·보기): total = 선곡의 그림 수, done = 이 기기에 준비됨, waiting = 서버에 아직 없음(PC 가 올리는 중) */
export const mediaFetch = ref<{ done: number; total: number; waiting: number } | null>(null)

const urls = new Map<string, Promise<string | null>>()
const sourceKey = () => (source ? `${source.code}:${source.kind}:${source.variant}` : '')

export function setMediaSource(s: MediaSource | null) {
  if (sourceKey() === (s ? `${s.code}:${s.kind}:${s.variant}` : '')) { source = s; return }
  source = s
  // 다른 채널·역할의 '없음' 기억은 버린다(있는 것은 그대로 — 같은 그림이면 같은 그림)
  for (const [k, p] of urls) void p.then((u) => { if (!u && urls.get(k) === p) urls.delete(k) })
  mediaFetch.value = null
  mediaTick.value++
}
/** 호스트가 '그림 올렸음'을 알림 → 없던 그림 다시 찾기 */
export function bumpMedia() {
  for (const [k, p] of urls) void p.then((u) => { if (!u && urls.get(k) === p) urls.delete(k) })
  mediaTick.value++
}

export function mediaUrl(id: string): Promise<string | null> {
  const want = source?.variant ?? 'full'
  const k = `${id}:${want}`
  let p = urls.get(k)
  if (!p) {
    p = load(id, want).catch(() => null)
    urls.set(k, p)
    // 없음(아직 안 올라옴 등)은 잠깐만 기억 — 나중에 생기면 다시 찾게
    void p.then((u) => { if (!u) setTimeout(() => { if (urls.get(k) === p) urls.delete(k) }, 4000) })
  }
  return p
}

async function load(id: string, want: 'full' | 'thumb'): Promise<string | null> {
  const m = await getMedia(id).catch(() => undefined)
  if (m) return URL.createObjectURL(m.blob)
  const src = source
  if (!src) return null
  const r = await fetchMedia(src, id, want)
  if (r.status !== 'ok' || !r.blob) return null
  if (src.persist && want === 'full') {
    const bmp = await createImageBitmap(r.blob).catch(() => null)
    await putMedia({ id, blob: r.blob, w: bmp?.width ?? 0, h: bmp?.height ?? 0, savedAt: new Date().toISOString() }).catch(() => {})
    bmp?.close()
  }
  return URL.createObjectURL(r.blob)
}

function tokenOf(s: MediaSource): string | null {
  if (s.kind === 'host') return loadHost(s.code)?.token ?? null
  return getToken(s.kind, s.code)
}

async function fetchMedia(s: MediaSource, id: string, variant: 'full' | 'thumb'): Promise<{ status: string; blob?: Blob }> {
  if (!supabase) return { status: 'error' }
  const { data, error } = await supabase.rpc('get_media', { p_code: s.code, p_kind: s.kind, p_token: tokenOf(s), p_media_id: id, p_variant: variant })
  const row = (data as { status: string; data: string | null }[] | null)?.[0]
  if (error || !row) return { status: 'error' }
  if (row.status !== 'ok' || !row.data) return { status: row.status }
  return { status: 'ok', blob: base64ToBlob(row.data) }
}

export function base64ToBlob(b64: string): Blob {
  const bin = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return new Blob([out]) // 형식은 브라우저가 내용으로 알아본다(webp·png·jpg)
}

/**
 * 선곡의 그림을 미리 받아 둔다(리모컨·보기 — 넘길 때 기다리지 않게). 순서대로, 동시에 3개.
 * 서버에 아직 없는 것은 waiting 으로 세고, 호스트의 알림(bumpMedia)이나 다음 호출 때 다시.
 */
let prefetchGen = 0
export async function prefetchMedia(slides: readonly string[]) {
  const my = ++prefetchGen
  if (!source) { mediaFetch.value = null; return }
  const ids = [...new Set(slides.filter(isMediaSlide).map(mediaIdOf))]
  if (!ids.length) { mediaFetch.value = null; return }
  let done = 0, waiting = 0, i = 0
  mediaFetch.value = { done, total: ids.length, waiting }
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++]!
      const u = await mediaUrl(id)
      if (my !== prefetchGen) return
      if (u) done++; else waiting++
      mediaFetch.value = { done, total: ids.length, waiting }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  if (my !== prefetchGen) return
  if (!waiting) setTimeout(() => { if (my === prefetchGen && mediaFetch.value?.waiting === 0) mediaFetch.value = null }, 1500)
}

/**
 * 안 쓰는 그림 지우기: 이 기기의 모든 선곡 저장본(biew.live.v1:*)과 선곡 기록(로컬 송출 기록은 그림까지 담는다)이 가리키지 않는 그림.
 * 선곡에서 빼거나 [송출 종료]해도 바로 지우지 않고, 컨트롤러를 열 때 정리한다(되돌리기·다른 창 여유).
 * 방금 넣은 그림(10분 안)은 남긴다 — 다른 창에서 넣는 중일 수 있으므로.
 */
export async function cleanupMedia(): Promise<number> {
  const states: { setlist?: { slides?: unknown[] }[] }[] = []
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('biew.live.v1:')) continue
      try { states.push(JSON.parse(localStorage.getItem(k) ?? 'null') ?? {}) } catch { /* 깨진 저장본은 무시 */ }
    }
  } catch { return 0 }
  try { for (const setlist of await allHistorySetlists()) states.push({ setlist }) } catch { return 0 } // 기록을 못 읽으면 지우지 않는다(안전 쪽)
  const used = referencedMedia(states)
  const ids = await allMediaIds()
  const old: string[] = []
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const id of ids) {
    if (used.has(id)) continue
    const m = await getMedia(id)
    if (m && Date.parse(m.savedAt) < cutoff) old.push(id)
  }
  if (old.length) await removeMedia(old)
  return old.length
}
