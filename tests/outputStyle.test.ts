import { describe, it, expect, beforeEach, vi } from 'vitest'
import { normalizeStyle, sameStyle } from '../shared/outputStyle'
import { DEFAULT_STYLE } from '../shared/types'

describe('출력 설정 정규화', () => {
  it('빈 값·쓰레기 값은 기본값', () => {
    expect(normalizeStyle(undefined)).toEqual(DEFAULT_STYLE)
    expect(normalizeStyle({ fontSize: 'big', color: 'red', fontWeight: 500, position: 'left', transition: 'wipe' })).toEqual(DEFAULT_STYLE)
  })
  it('범위 밖 숫자는 슬라이더 범위로', () => {
    const s = normalizeStyle({ ...DEFAULT_STYLE, fontSize: 99, leftMargin: -3, fadeMs: 5 })
    expect([s.fontSize, s.leftMargin, s.fadeMs]).toEqual([15, 0, 100])
  })
  it('예전 값 이전: bottom → top, background green → 초록 단색', () => {
    const s = normalizeStyle({ position: 'bottom', background: 'green' })
    expect(s.position).toBe('top')
    expect(s.backdrop).toEqual({ kind: 'solid', color: '#00b140' })
    expect('background' in s).toBe(false)
  })
  it('sameStyle 은 필드 순서와 무관', () => {
    const rev = Object.fromEntries(Object.entries(DEFAULT_STYLE).reverse()) as typeof DEFAULT_STYLE
    expect(sameStyle(rev, DEFAULT_STYLE)).toBe(true)
    expect(sameStyle({ ...DEFAULT_STYLE, color: '#ff0000' }, DEFAULT_STYLE)).toBe(false)
  })
})

describe('저장된 출력 설정(이 PC)', () => {
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k), key: () => null, length: 0, clear: () => m.clear(),
    })
    vi.resetModules()
  })
  const load = () => import('../src/live/stylePresets')

  it('저장 · 같은 이름(대소문자·앞뒤 공백 무시)은 덮어쓰기 · 삭제', async () => {
    const p = await load()
    expect(p.savePreset('  ', DEFAULT_STYLE)).toBeTruthy()
    expect(p.savePreset('Main', DEFAULT_STYLE)).toBeNull()
    expect(p.savePreset(' main ', { ...DEFAULT_STYLE, fontSize: 9 })).toBeNull()
    expect(p.presets.value).toHaveLength(1)
    expect(p.presets.value[0]!.style.fontSize).toBe(9)
    p.deletePreset(p.presets.value[0]!.id)
    expect(p.presets.value).toHaveLength(0)
  })
  it('새로 불러와도(다시 열기) 목록 유지', async () => {
    ;(await load()).savePreset('A', DEFAULT_STYLE)
    vi.resetModules()
    expect((await load()).presets.value.map((x) => x.name)).toEqual(['A'])
  })
  it('내보내기 → 가져오기: 같은 이름은 바꾸고 새 이름은 추가, 잘못된 파일은 거부', async () => {
    const p = await load()
    p.savePreset('A', DEFAULT_STYLE)
    p.savePreset('B', { ...DEFAULT_STYLE, color: '#ffff00' })
    const file = p.exportJson()
    p.deletePreset(p.presets.value.find((x) => x.name === 'B')!.id)
    p.savePreset('A', { ...DEFAULT_STYLE, fontSize: 12 })
    expect(p.importJson(file)).toEqual({ added: 1, replaced: 1 })
    expect(p.presets.value.find((x) => x.name === 'A')!.style.fontSize).toBe(DEFAULT_STYLE.fontSize)
    expect(p.importJson('{"presets":[]}').error).toBeTruthy()
    expect(p.importJson('not json').error).toBeTruthy()
  })
})
