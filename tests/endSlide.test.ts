import { describe, it, expect } from 'vitest'
import { END_SLIDE, ensureEnd, withoutEnd, realCount, posLabel, hasProperEnd, isEndSlide } from '../shared/endSlide'
import { itemFingerprint } from '../shared/history'
import { normalizeLive } from '../src/live/persistence'
import * as nav from '../src/live/nav'
import { emptyLiveState } from '../shared/types'

describe('곡 끝 빈 장(2026-11-26)', () => {
  it('맨 끝에 하나만, 중간에 끼면 끝으로, 장이 없으면 안 붙임', () => {
    expect(ensureEnd(['A', 'B'])).toEqual(['A', 'B', END_SLIDE])
    expect(ensureEnd(['A', END_SLIDE])).toEqual(['A', END_SLIDE])
    expect(ensureEnd(['A', END_SLIDE, 'B', END_SLIDE, END_SLIDE])).toEqual(['A', 'B', END_SLIDE])
    expect(ensureEnd([])).toEqual([])
    expect(hasProperEnd(['A', END_SLIDE])).toBe(true)
    expect(hasProperEnd(['A'])).toBe(false)
  })
  it('장 수: 끝 빈 장은 세지 않고, 중간 빈 장(\'\')은 센다', () => {
    const s = ['A', '', 'C', END_SLIDE]
    expect(realCount(s)).toBe(3)
    expect(posLabel(s, 0)).toBe('1/3')
    expect(posLabel(s, 1)).toBe('2/3')
    expect(posLabel(s, 3)).toBe('빈 화면')
    expect(posLabel(s, -1)).toBe('')
    expect(withoutEnd(s)).toEqual(['A', '', 'C'])
    expect(isEndSlide('')).toBe(false)
  })
  it('원본 비교 지문은 끝 빈 장을 무시(업데이트 전 지문과 같음)', () => {
    expect(itemFingerprint({ title: 'L', slides: ['A', END_SLIDE] })).toBe(itemFingerprint({ title: 'L', slides: ['A'] }))
  })
  it('예전 선곡을 불러오면 끝 빈 장이 붙고 송출 중인 장 번호는 그대로', () => {
    const s = { ...emptyLiveState('t'), itemIndex: 0, slideIndex: 1, setlist: [{ key: 'k', songId: 's', title: 'L', slides: ['A', 'B'] }, { key: 'k2', songId: 's2', title: 'M', slides: ['C'] }] }
    const n = normalizeLive(s)
    expect(n.setlist[0]!.slides).toEqual(['A', 'B', END_SLIDE])
    expect(n.slideIndex).toBe(1)
    // ▶: 마지막 장 → 끝 빈 장 → 다음 곡 첫 장
    expect(nav.next(n)).toEqual({ itemIndex: 0, slideIndex: 2 })
    expect(nav.next({ ...n, slideIndex: 2 })).toEqual({ itemIndex: 1, slideIndex: 0 })
    // 숫자 키는 끝 빈 장 제외
    expect(nav.nth(n, 3)).toBeNull()
    expect(nav.nth(n, 2)).toEqual({ itemIndex: 0, slideIndex: 1 })
  })
})
