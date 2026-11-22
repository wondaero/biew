import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { DEFAULT_STYLE } from '../shared/types'

// useStylePreview 는 window.setInterval 을 쓴다 — node 환경에선 전역 타이머로
vi.stubGlobal('window', globalThis)
const { useStylePreview, PREVIEW_TTL_MS } = await import('../src/live/stylePreview')

describe('바로 적용 임시 설정(받는 쪽)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const red = { ...DEFAULT_STYLE, color: '#ff0000' }
  const setup = (version: { v: number }) => {
    const scope = effectScope()
    const p = scope.run(() => useStylePreview(() => version.v))!
    return { p, stop: () => scope.stop() }
  }

  it('받으면 덮어쓰고, null 이면 끝', () => {
    const { p, stop } = setup({ v: 1 })
    p.onMessage({ type: 'style-preview', style: red })
    expect(p.style.value?.color).toBe('#ff0000')
    p.onMessage({ type: 'style-preview', style: null })
    expect(p.style.value).toBeNull()
    stop()
  })
  it('저장(until): 저장된 상태를 받을 때까지 유지 → 받으면 끝(옛 설정으로 깜빡이지 않게)', () => {
    const v = { v: 5 }
    const { p, stop } = setup(v)
    p.onMessage({ type: 'style-preview', style: red })
    p.onMessage({ type: 'style-preview', style: null, until: 9 })
    expect(p.style.value?.color).toBe('#ff0000')
    p.onState({ version: 8 })
    expect(p.style.value).not.toBeNull()
    p.onState({ version: 9 })
    expect(p.style.value).toBeNull()
    stop()
  })
  it('저장된 상태가 이미 와 있으면 바로 끝', () => {
    const { p, stop } = setup({ v: 9 })
    p.onMessage({ type: 'style-preview', style: red })
    p.onMessage({ type: 'style-preview', style: null, until: 9 })
    expect(p.style.value).toBeNull()
    stop()
  })
  it('신호가 끊기면(컨트롤러 꺼짐) 6초 뒤 스스로 끝, 2초마다 다시 오면 유지', () => {
    const { p, stop } = setup({ v: 1 })
    p.onMessage({ type: 'style-preview', style: red })
    vi.advanceTimersByTime(2000); p.onMessage({ type: 'style-preview', style: red })
    vi.advanceTimersByTime(4000)
    expect(p.style.value).not.toBeNull()
    vi.advanceTimersByTime(PREVIEW_TTL_MS)
    expect(p.style.value).toBeNull()
    stop()
  })
  it('잘못된 값은 정리해서 그린다(보기 주소는 다른 기기도 보낼 수 있음)', () => {
    const { p, stop } = setup({ v: 1 })
    p.onMessage({ type: 'style-preview', style: { ...red, fontSize: 999 } as never })
    expect(p.style.value?.fontSize).toBe(15)
    stop()
  })
})
