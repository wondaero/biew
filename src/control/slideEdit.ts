/**
 * 슬라이드 한 장 고치기(콘티 카드의 ✎) — 순수 규칙. 사용자 결정(2026-11-18): 콘티 + 곡 원본 둘 다(원본은 체크로 끌 수 있음).
 * 곡 원본 전체를 콘티 스냅샷으로 덮어쓰지 않고 '그 글'만 바꾼다 → 그 사이 원본의 다른 장이 고쳐졌어도 지우지 않는다.
 */

/** 줄 끝 공백·앞뒤 빈 줄 정리(CRLF → LF). 빈 줄이 남아 있으면 null — 슬라이드 나누기는 곡 편집기의 일 */
export function cleanSlideText(raw: string): string | null {
  const t = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, '')
  if (!t || /\n\s*\n/.test(t)) return null
  return t
}

/** 같은 글인 장 번호들(후렴 반복 등) */
export function sameTextIndexes(slides: readonly string[], text: string): number[] {
  return slides.flatMap((s, j) => (s === text ? [j] : []))
}

/**
 * 곡 원본에 같은 수정을 적용한 새 슬라이드 목록. 어느 장인지 확실하지 않으면 null(원본은 건드리지 않음).
 *  - all: 원본에서 oldText 와 같은 장 전부
 *  - 아니면: 같은 번호(j)의 글이 oldText 면 그 장, 아니면 oldText 가 딱 한 장일 때만 그 장
 */
export function patchSongSlides(song: readonly string[], j: number, oldText: string, newText: string, all: boolean): string[] | null {
  const hits = sameTextIndexes(song, oldText)
  if (!hits.length) return null
  const targets = all ? hits : song[j] === oldText ? [j] : hits.length === 1 ? hits : null
  if (!targets) return null
  const out = [...song]
  for (const k of targets) out[k] = newText
  return out
}
