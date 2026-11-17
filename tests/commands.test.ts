import { describe, it, expect } from 'vitest'
import { parseCommand } from '../src/live/commands'
import { isLiveState, normalizeLive } from '../src/live/persistence'
import { emptyLiveState } from '../shared/types'

const state = { setlist: [{ key: 'a', songId: 'a', title: 'a', slides: ['Lorem 0', 'Lorem 1'] }, { key: 'b', songId: 'b', title: 'b', slides: [] }] }

describe('parseCommand — 리모컨이 보낼 수 있는 것만 통과', () => {
  it('이동/블랭크 명령은 허용', () => {
    for (const cmd of ['next', 'prev', 'nextSong', 'prevSong', 'blank']) expect(parseCommand({ cmd }, state)).toEqual({ cmd })
  })
  it('go 는 콘티 범위 안의 정수 좌표만', () => {
    expect(parseCommand({ cmd: 'go', itemIndex: 0, slideIndex: 1 }, state)).toEqual({ cmd: 'go', itemIndex: 0, slideIndex: 1 })
    expect(parseCommand({ cmd: 'go', itemIndex: 0, slideIndex: 2 }, state)).toBeNull() // 슬라이드 초과
    expect(parseCommand({ cmd: 'go', itemIndex: 1, slideIndex: 0 }, state)).toBeNull() // 슬라이드 없는 곡
    expect(parseCommand({ cmd: 'go', itemIndex: 5, slideIndex: 0 }, state)).toBeNull() // 곡 초과
    expect(parseCommand({ cmd: 'go', itemIndex: -1, slideIndex: 0 }, state)).toBeNull()
    expect(parseCommand({ cmd: 'go', itemIndex: 0.5, slideIndex: 0 }, state)).toBeNull()
    expect(parseCommand({ cmd: 'go', itemIndex: '0', slideIndex: 0 }, state)).toBeNull()
  })
  it('권한 밖 명령(freeze·콘티·스타일 등)과 이상한 입력은 거부', () => {
    for (const bad of [{ cmd: 'freeze' }, { cmd: 'unfreeze' }, { cmd: 'setStyle', patch: {} }, { cmd: 'replace', list: [] }, { cmd: 'constructor' }, { cmd: '__proto__' }, {}, null, undefined, 'next', 7, []]) {
      expect(parseCommand(bad, state)).toBeNull()
    }
  })
})

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
