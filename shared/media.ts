/**
 * 그림 슬라이드(PDF·이미지, 2026-11-23 사용자 요청 — PPT 를 PDF 로 저장해 올리면 장마다 그림으로 송출).
 *
 * 선곡 항목의 slides 글 자체에 '그림 표시'를 넣는다: `biew-media:<id>`.
 * 그래서 이동·FREEZE 스냅샷·장 수·서버 리모컨 명령(_apply_command)이 가사와 똑같이 동작한다(상태 모델 그대로).
 * 그림 파일은 상태에 넣지 않고 이 기기 IndexedDB(media)에 두고, 그리는 곳(SlideRender·카드)이 id 로 꺼낸다.
 * 그림이 없는 기기(폰 리모컨·보기 — 1단계는 서버에 안 올림)는 자리 표시만 그린다.
 */
export const MEDIA_PREFIX = 'biew-media:'
/** 그림 묶음 선곡 항목의 songId(곡 원본 없음 → ↻ 최신·곡 원본 저장 대상 아님) */
export const MEDIA_SONG_ID = 'media'

export const mediaSlide = (id: string) => MEDIA_PREFIX + id
export const isMediaSlide = (t: string | null | undefined): t is string => typeof t === 'string' && t.startsWith(MEDIA_PREFIX)
export const mediaIdOf = (t: string) => t.slice(MEDIA_PREFIX.length)

/** 그림 묶음 항목인지(장이 모두 그림) */
export function isMediaItem(it: { songId: string; slides: readonly string[] } | null | undefined): boolean {
  return !!it && (it.songId === MEDIA_SONG_ID || (it.slides.length > 0 && it.slides.every(isMediaSlide)))
}

/** 상태(여러 채널 저장본)가 가리키는 그림 id 전부 — 안 쓰는 그림 정리용 */
export function referencedMedia(states: readonly { setlist?: readonly { slides?: readonly unknown[] }[]; frozen?: { text?: unknown } | null }[]): Set<string> {
  const out = new Set<string>()
  for (const s of states) {
    for (const it of s.setlist ?? []) for (const t of it.slides ?? []) if (typeof t === 'string' && isMediaSlide(t)) out.add(mediaIdOf(t))
    // FREEZE 로 걸어 둔 그림(선곡에서 빠졌어도 송출 중) — 정리하면 출력 창이 복구할 때 그림이 사라짐
    const ft = s.frozen?.text
    if (typeof ft === 'string' && isMediaSlide(ft)) out.add(mediaIdOf(ft))
  }
  return out
}

/** 파일 이름 자연 정렬(슬라이드2 < 슬라이드10) — PowerPoint '모든 슬라이드 내보내기' 이름 순서 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' })
}
