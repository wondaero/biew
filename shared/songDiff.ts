/**
 * 곡 두 버전 비교(사용자 요청 2026-11-19 — "이 곡이 다르다"가 아니라 "이 곡의 어디가 다르다").
 * 다운로드(이 기기 → DB 버전)·업로드(DB → 내 버전) 화면이 같은 규칙으로 보여 준다.
 *  - 슬라이드: 같은 장을 기준점(LCS)으로 맞춘 뒤, 기준점 사이에 남은 장은 순서대로 짝지어 '바뀜', 남는 건 '추가'/'삭제'.
 *    (장 하나를 중간에 끼워 넣어도 뒤의 장이 전부 '바뀜'으로 나오지 않게)
 *  - 바뀐 장 안의 줄도 같은 방식, 바뀐 줄은 앞뒤 공통 부분을 빼고 다른 가운데만 강조.
 * 순수 함수 — 브라우저·Node 공용, 단위 테스트 대상.
 */

export interface Seg { pre: string; a: string; b: string; suf: string }
export type LineDiff =
  | { kind: 'same'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'changed'; seg: Seg }
export type SlideDiff =
  | { kind: 'same'; a: number; b: number }
  | { kind: 'added'; b: number; text: string }
  | { kind: 'removed'; a: number; text: string }
  | { kind: 'changed'; a: number; b: number; lines: LineDiff[] }
export interface SongDiff {
  title: { a: string; b: string } | null
  slides: SlideDiff[]
  /** 다른 곳 개수(제목 + 같지 않은 장) */
  count: number
}

type Pair<T> = { kind: 'same'; a: number; b: number } | { kind: 'changed'; a: number; b: number } | { kind: 'added'; b: number; v: T } | { kind: 'removed'; a: number; v: T }

/** LCS 로 같은 항목을 맞추고, 사이 구간은 순서대로 짝지음 */
function align<T>(A: readonly T[], B: readonly T[]): Pair<T>[] {
  const n = A.length, m = B.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = A[i] === B[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
  const anchors: [number, number][] = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[i] === B[j]) { anchors.push([i, j]); i++; j++ }
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++
    else j++
  }
  anchors.push([n, m])
  const out: Pair<T>[] = []
  let pi = 0, pj = 0
  for (const [ai, bj] of anchors) {
    const ga = ai - pi, gb = bj - pj, k = Math.min(ga, gb)
    for (let t = 0; t < k; t++) out.push({ kind: 'changed', a: pi + t, b: pj + t })
    for (let t = k; t < ga; t++) out.push({ kind: 'removed', a: pi + t, v: A[pi + t]! })
    for (let t = k; t < gb; t++) out.push({ kind: 'added', b: pj + t, v: B[pj + t]! })
    if (ai < n) out.push({ kind: 'same', a: ai, b: bj })
    pi = ai + 1; pj = bj + 1
  }
  return out
}

/** 앞뒤 공통 부분을 뺀 가운데(다른 곳) */
export function segment(a: string, b: string): Seg {
  const A = [...a], B = [...b]
  let p = 0
  while (p < A.length && p < B.length && A[p] === B[p]) p++
  let s = 0
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++
  return { pre: A.slice(0, p).join(''), a: A.slice(p, A.length - s).join(''), b: B.slice(p, B.length - s).join(''), suf: A.slice(A.length - s).join('') }
}

export function diffLines(a: string, b: string): LineDiff[] {
  const A = a.split('\n'), B = b.split('\n')
  return align(A, B).map((x): LineDiff => {
    if (x.kind === 'same') return { kind: 'same', text: A[x.a]! }
    if (x.kind === 'changed') return { kind: 'changed', seg: segment(A[x.a]!, B[x.b]!) }
    return { kind: x.kind, text: x.v }
  })
}

/** a = 기준(이 기기 / DB), b = 비교 대상 */
export function diffSongs(a: { title: string; slides: readonly string[] }, b: { title: string; slides: readonly string[] }): SongDiff {
  const title = a.title === b.title ? null : { a: a.title, b: b.title }
  const slides = align(a.slides, b.slides).map((x): SlideDiff => {
    if (x.kind === 'same') return x
    if (x.kind === 'changed') return { kind: 'changed', a: x.a, b: x.b, lines: diffLines(a.slides[x.a]!, b.slides[x.b]!) }
    return x.kind === 'added' ? { kind: 'added', b: x.b, text: x.v } : { kind: 'removed', a: x.a, text: x.v }
  })
  return { title, slides, count: (title ? 1 : 0) + slides.filter((s) => s.kind !== 'same').length }
}

/** 한 줄 요약: "제목 · 3장 · 5장 추가 · 2장 삭제" (장 번호는 b 기준, 삭제는 a 기준) */
export function diffSummary(d: SongDiff): string {
  const parts: string[] = []
  if (d.title) parts.push('제목')
  for (const s of d.slides) {
    if (s.kind === 'changed') parts.push(`${s.b + 1}장`)
    else if (s.kind === 'added') parts.push(`${s.b + 1}장 추가`)
    else if (s.kind === 'removed') parts.push(`${s.a + 1}장 삭제`)
  }
  return parts.length ? parts.join(' · ') : '같음'
}
