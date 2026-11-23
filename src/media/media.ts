/**
 * 그림 슬라이드 만들기·꺼내기·정리(shared/media.ts 설명 참고). 모두 이 기기 안에서 — 서버·인터넷 불필요.
 *  - PDF: pdf.js 로 장마다 그림(처음 쓸 때만 불러옴, PWA 에 포함되어 오프라인도 됨)
 *  - 이미지: 여러 장(이름 순 — PowerPoint '모든 슬라이드 내보내기' 순서)
 *  - .ppt/.pptx: 브라우저가 정확히 그릴 수 없다(글꼴·도형이 틀어짐) → PowerPoint 에서 PDF 로 저장하라고 안내
 */
import { putMedia, getMedia, allMediaIds, removeMedia } from '@/library/db'
import { mediaSlide, naturalCompare, referencedMedia } from '@shared/media'
import { uid } from '@/lib/uid'

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
  urls.delete(id) // 예전에 '없음'으로 기억했으면 다시 찾게
  return mediaSlide(id)
}

// ── 그리기: id → 이 창에서 쓸 주소(object URL). 같은 그림은 한 번만 꺼낸다 ──
const urls = new Map<string, Promise<string | null>>()
export function mediaUrl(id: string): Promise<string | null> {
  let p = urls.get(id)
  if (!p) {
    p = getMedia(id).then((m) => (m ? URL.createObjectURL(m.blob) : null)).catch(() => null)
    urls.set(id, p)
    // 없음(아직 안 받음 등)은 잠깐만 기억 — 나중에 생기면 다시 찾게
    void p.then((u) => { if (!u) setTimeout(() => { if (urls.get(id) === p) urls.delete(id) }, 5000) })
  }
  return p
}

/**
 * 안 쓰는 그림 지우기: 이 기기의 모든 선곡 저장본(biew.live.v1:*)이 가리키지 않는 그림.
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
