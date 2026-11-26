/**
 * 곡 끝 빈 장(2026-11-26 사용자 요청): 선곡의 모든 곡(그림 묶음 포함) 맨 끝에 빈 화면 한 장을 자동으로 붙인다 —
 * 곡이 끝나면 ▶ 한 번에 빈 화면, 한 번 더 누르면 다음 곡.
 *  - DB·곡 원본에는 넣지 않는다(프로그램이 선곡에 붙임) → 새 버전을 적용하면 이미 있는 선곡에도 자동으로 붙는다(normalizeLive).
 *  - 일반 빈 글('')이 아니라 표시 글 `biew-end:` — 사용자가 곡 중간에 넣은 빈 장과 구분하기 위해
 *    (장 수: 끝 빈 장은 세지 않고, 중간 빈 장은 센다 — "값이 있는 장 3개 + 끝 빈 장" = 1/3 … 3/3).
 *  - 선곡 안에선 진짜 한 장이라 이동·FREEZE·리모컨(서버 _apply_command)·송출 화면이 그대로 동작한다. 그리는 곳은 빈 화면으로.
 *  - 원본에 저장·"변경됨" 판단·기록 지문에서는 뺀다. 편집·복사·삭제·끌기 대상이 아니고 언제나 맨 끝.
 */
export const END_SLIDE = 'biew-end:'
export const isEndSlide = (t: string | null | undefined): boolean => t === END_SLIDE

/** 끝 빈 장을 뺀 장들(곡 원본에 저장·비교용) */
export const withoutEnd = (slides: readonly string[]): string[] => slides.filter((s) => !isEndSlide(s))

/** 맨 끝에 끝 빈 장이 정확히 하나 있게(중간에 끼어 있으면 빼고 끝으로). 장이 하나도 없으면 붙이지 않음 */
export function ensureEnd(slides: readonly string[]): string[] {
  const real = withoutEnd(slides)
  return real.length ? [...real, END_SLIDE] : real
}

/** 이미 맞는 모양인지(바꿀 필요 없음) */
export function hasProperEnd(slides: readonly string[]): boolean {
  const n = slides.length
  if (!n) return true
  return isEndSlide(slides[n - 1]) && slides.slice(0, -1).every((s) => !isEndSlide(s))
}

/** 화면에 보이는 장 수(끝 빈 장 제외) */
export const realCount = (slides: readonly string[]): number => withoutEnd(slides).length

/** "2/3" · 끝 빈 장이면 "빈 화면" · 대기(-1)면 '' */
export function posLabel(slides: readonly string[], j: number, sep = '/'): string {
  if (j < 0) return ''
  if (isEndSlide(slides[j])) return '빈 화면'
  return `${j + 1}${sep}${realCount(slides)}`
}
