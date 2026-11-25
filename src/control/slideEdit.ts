/**
 * 슬라이드 한 장 고치기(선곡 카드의 ✎) — 순수 규칙. 사용자 결정(2026-11-18): 선곡 + 곡 원본 둘 다(원본은 체크로 끌 수 있음).
 * 곡 원본 전체를 선곡 스냅샷으로 덮어쓰지 않고 '그 글'만 바꾼다 → 그 사이 원본의 다른 장이 고쳐졌어도 지우지 않는다.
 * 2026-11-19: 빈 줄 = 그 자리에서 장 나누기(현장에서 한 장을 둘로 쪼개기·뒤에 장 추가). 장 수가 바뀌면 송출·미리보기 위치를
 * '같은 글'을 가리키도록 옮긴다(remapIndex) — 번호를 그대로 두면 송출 화면이 다른 장으로 튄다.
 * 2026-11-22: 장 삭제 = 그 장을 0장으로 바꾸기(pieces = []). 지운 장을 가리키던 위치는 그 자리로 당겨진 다음 장(마지막이었으면 앞 장).
 *   송출 중인 장을 지우면 BLANK(송출 중 곡을 선곡에서 빼면 BLANK 인 것과 같은 규칙 — 예배 중 엉뚱한 장이 갑자기 나가지 않게).
 *   곡의 마지막 한 장은 못 지운다(곡을 빼려면 선곡에서).
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
 * 장을 나누거나(n > 1) 지운(n = 0) 뒤의 새 번호. 바뀐 장보다 앞에서 늘거나 준 만큼 밀린다.
 * 바뀐 장 자체를 가리키던 위치는 나눈 것 중 첫 장으로(같은 자리의 글) — 지웠으면 그 자리로 당겨진 다음 장.
 * total(바뀐 뒤 장 수)을 주면 범위 안으로(마지막 장을 지웠으면 앞 장).
 */
export function remapIndex(old: number, targets: readonly number[], n: number, total = Infinity): number {
  const before = targets.filter((t) => t < old).length
  return Math.max(0, Math.min(old + before * (n - 1), total - 1))
}


/**
 * 장 복사(2026-11-25 사용자 요청, 카드 ⋯ → 복사): j 장을 바로 뒤에 한 장 더. 오늘 선곡에만(곡 원본은 그대로 —
 * 인도자 반복 같은 그날 진행용 배치). 위치: j 보다 뒤를 가리키던 것만 한 칸 뒤로(원래 장은 그대로).
 */
export function duplicateAt(slides: readonly string[], j: number): string[] {
  return [...slides.slice(0, j + 1), slides[j]!, ...slides.slice(j + 1)]
}
export const duplicateIndex = (old: number, j: number): number => (old > j ? old + 1 : old)

/**
 * 장 순서 바꾸기(2026-11-25 사용자 요청, 카드를 끌어서): from 장을 to 자리로. 오늘 선곡에만.
 * 위치는 같은 장을 따라간다(옮긴 장을 가리키던 것은 to, 그 사이 장들은 한 칸씩 당겨지거나 밀림).
 */
export function moveAt(slides: readonly string[], from: number, to: number): string[] {
  const next = [...slides]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x!)
  return next
}
export function moveIndex(old: number, from: number, to: number): number {
  if (old === from) return to
  if (from < old && old <= to) return old - 1
  if (to <= old && old < from) return old + 1
  return old
}
