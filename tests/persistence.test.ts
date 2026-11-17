import { describe, it, expect } from 'vitest'
import { isLiveState, normalizeLive } from '../src/live/persistence'
import { emptyLiveState } from '../shared/types'


describe('상태 정규화', () => {
  it('서버의 빈 state({})는 LiveState 가 아니다', () => {
    expect(isLiveState({})).toBe(false)
    expect(isLiveState(emptyLiveState('x'))).toBe(true)
  })
  it('예전 저장값(bottom, 임시 60, frozen 없음)을 현재 형식으로', () => {
    const old = { ...emptyLiveState('x'), style: { ...emptyLiveState('x').style, position: 'bottom', topMargin: 60 } } as never
    delete (old as { frozen?: unknown }).frozen
    delete (old as { style: { leftMargin?: unknown } }).style.leftMargin // 그 버전엔 leftMargin 이 없었다
    const n = normalizeLive(old)
    expect(n.style.position).toBe('top')
    expect(n.style.topMargin).toBe(5)
    expect(n.frozen).toBeNull()
  })
  it('사용자가 일부러 고른 위 여백 60(leftMargin 이 있는 새 설정)은 그대로 둔다', () => {
    const s = { ...emptyLiveState('x'), style: { ...emptyLiveState('x').style, topMargin: 60, leftMargin: 5 } }
    expect(normalizeLive(s).style.topMargin).toBe(60)
  })
})
