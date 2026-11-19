/**
 * 슬라이드 한 장 고치기(콘티 카드의 ✎) — 순수 규칙. 사용자 결정(2026-11-18): 콘티 + 곡 원본 둘 다(원본은 체크로 끌 수 있음).
 * 곡 원본 전체를 콘티 스냅샷으로 덮어쓰지 않고 '그 글'만 바꾼다 → 그 사이 원본의 다른 장이 고쳐졌어도 지우지 않는다.
 * 2026-11-19: 빈 줄 = 그 자리에서 장 나누기(현장에서 한 장을 둘로 쪼개기·뒤에 장 추가). 장 수가 바뀌면 송출·미리보기 위치를
 * '같은 글'을 가리키도록 옮긴다(remapIndex) — 번호를 그대로 두면 송출 화면이 다른 장으로 튄다.
 */
import { textToSlides } from '@shared/slidesText'

/** 고친 글 → 장들(빈 줄 = 나누기, 곡 편집기와 같은 규칙). 비었으면 null */
export function parseSlideEdit(raw: string): string[] | null {
  const pieces = textToSlides(raw)
  return pieces.length ? pieces : null
}

/** 같은 글인 장 번호들(후렴 반복 등) */
export function sameTextIndexes(slides: readonly string[], text: string): number[] {
  return slides.flatMap((s, j) => (s === text ? [j] : []))
}

/** targets(오름차순) 의 장을 각각 pieces 로 바꾼 새 목록 */
export function replaceSlides(slides: readonly string[], targets: readonly number[], pieces: readonly string[]): string[] {
  const set = new Set(targets)
  return slides.flatMap((s, j) => (set.has(j) ? [...pieces] : [s]))
}

/**
 * 장을 나눈 뒤의 새 번호. 바뀐 장보다 앞에서 늘어난 만큼 뒤로 밀린다.
 * 바뀐 장 자체를 가리키던 위치는 나눈 것 중 첫 장으로(같은 자리의 글).
 */
export function remapIndex(old: number, targets: readonly number[], n: number): number {
  const before = targets.filter((t) => t < old).length
  return old + before * (n - 1)
}

/**
 * 곡 원본에 같은 수정을 적용한 새 슬라이드 목록. 어느 장인지 확실하지 않으면 null(원본은 건드리지 않음).
 *  - all: 원본에서 oldText 와 같은 장 전부
 *  - 아니면: 같은 번호(j)의 글이 oldText 면 그 장, 아니면 oldText 가 딱 한 장일 때만 그 장
 * pieces 가 여러 장이면 그 자리에 나눠 넣는다.
 */
export function patchSongSlides(song: readonly string[], j: number, oldText: string, pieces: readonly string[], all: boolean): string[] | null {
  const hits = sameTextIndexes(song, oldText)
  if (!hits.length) return null
  const targets = all ? hits : song[j] === oldText ? [j] : hits.length === 1 ? hits : null
  if (!targets) return null
  return replaceSlides(song, targets, pieces)
}
