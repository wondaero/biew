/**
 * 출력 설정(OutputStyle) 정규화 — 저장본·받은 상태·저장된 출력 설정(프리셋)·가져온 파일을 모두 같은 규칙으로 현재 형식에 맞춘다.
 * 값이 없거나 잘못되면 그 필드만 기본값(DEFAULT_STYLE). 범위는 출력 설정 슬라이더와 같다.
 */
import { DEFAULT_STYLE, type OutputStyle, type TextPosition, type TransitionKind } from './types'
import { toBackdrop } from './backdrop'

const isHex = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x)
const num = (x: unknown, min: number, max: number, def: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def

export function normalizeStyle(v: unknown): OutputStyle {
  const raw = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const d = DEFAULT_STYLE
  // 잘못 잡았던 임시 기본값(위 60)은 leftMargin 이 생기기 전 버전에서만 저장됐다.
  // 그 경우만 바로잡는다 — 사용자가 일부러 60(슬라이더 최대값)으로 둔 설정까지 매번 5로 되돌리면 안 되므로.
  const legacyTop60 = raw.topMargin === 60 && raw.leftMargin === undefined
  // 예전 값 'bottom'(하단 기준) → 상단 기준
  const position: TextPosition = raw.position === 'center' ? 'center' : 'top'
  const transition: TransitionKind = raw.transition === 'cut' || raw.transition === 'fade' ? raw.transition : d.transition
  const fontFamily = typeof raw.fontFamily === 'string' && raw.fontFamily.trim() && raw.fontFamily.length <= 300 ? raw.fontFamily : d.fontFamily
  return {
    fontFamily,
    fontSize: num(raw.fontSize, 3, 15, d.fontSize),
    fontWeight: raw.fontWeight === 400 || raw.fontWeight === 700 || raw.fontWeight === 800 ? raw.fontWeight : d.fontWeight,
    lineHeight: num(raw.lineHeight, 1, 2, d.lineHeight),
    color: isHex(raw.color) ? raw.color : d.color,
    outlineWidth: num(raw.outlineWidth, 0, 1, d.outlineWidth),
    outlineColor: isHex(raw.outlineColor) ? raw.outlineColor : d.outlineColor,
    shadow: typeof raw.shadow === 'boolean' ? raw.shadow : d.shadow,
    position,
    topMargin: legacyTop60 ? d.topMargin : num(raw.topMargin, 0, 60, d.topMargin),
    leftMargin: num(raw.leftMargin, 0, 40, d.leftMargin),
    // 배경: 예전 background('black'|'green') → backdrop(단색), 잘못된 값은 검정
    backdrop: toBackdrop(raw.backdrop, raw.background),
    transition,
    fadeMs: num(raw.fadeMs, 100, 1000, d.fadeMs),
  }
}

/** 두 설정이 화면상 같은가(필드 순서와 무관) */
export function sameStyle(a: OutputStyle, b: OutputStyle): boolean {
  const k = (s: OutputStyle) => JSON.stringify(normalizeStyle(s))
  return k(a) === k(b)
}
