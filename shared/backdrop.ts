/**
 * 송출 화면 배경. 종류(kind)별로 늘릴 수 있게 둔다 — 나중에 배경 이미지가 필요하면 { kind: 'image', ... } 를 추가
 * (이미지는 오프라인에서도 보이도록 PC 에 저장해야 하므로 별도 작업. 지금은 단색·2색 그라데이션만).
 *
 * ATEM 키잉: 루마키는 검정, 크로마키는 초록 '단색'이어야 배경이 빠진다. 그 외(다른 색·그라데이션)는 키잉 불가 —
 * 화면을 프로젝터·TV 에 그대로 띄울 때만 쓴다.
 */
export type BgDirection = 'to bottom' | 'to right' | 'to bottom right' | 'to bottom left'

export type Backdrop =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; direction: BgDirection }

export const KEY_BLACK = '#000000'
export const KEY_GREEN = '#00b140'
export const DEFAULT_BACKDROP: Backdrop = { kind: 'solid', color: KEY_BLACK }

/** CSS background 값 */
export function backdropCss(b: Backdrop): string {
  return b.kind === 'gradient' ? `linear-gradient(${b.direction}, ${b.from}, ${b.to})` : b.color
}

/** ATEM 루마키(검정)·크로마키(초록)로 뺄 수 있는 배경인가 */
export function keyable(b: Backdrop): 'luma' | 'chroma' | null {
  if (b.kind !== 'solid') return null
  const c = b.color.toLowerCase()
  return c === KEY_BLACK ? 'luma' : c === KEY_GREEN ? 'chroma' : null
}

/** 예전 저장값(background: 'black' | 'green')·잘못된 값을 현재 형식으로 */
export function toBackdrop(v: unknown, legacy?: unknown): Backdrop {
  const b = v as Partial<Backdrop> | null | undefined
  const hex = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x)
  const dirs: BgDirection[] = ['to bottom', 'to right', 'to bottom right', 'to bottom left']
  if (b?.kind === 'solid' && hex(b.color)) return { kind: 'solid', color: b.color }
  if (b?.kind === 'gradient' && hex(b.from) && hex(b.to) && dirs.includes(b.direction as BgDirection)) {
    return { kind: 'gradient', from: b.from, to: b.to, direction: b.direction as BgDirection }
  }
  if (legacy === 'green') return { kind: 'solid', color: KEY_GREEN }
  return { ...DEFAULT_BACKDROP }
}
