import { describe, it, expect } from 'vitest'
import * as nav from '../src/live/nav'
import type { SetlistItem } from '../shared/types'

const item = (key: string, n: number): SetlistItem => ({ key, songId: key, title: key, slides: Array.from({ length: n }, (_, i) => `Lorem ${i}`) })
const setlist = [item('a', 3), item('empty', 0), item('b', 2)]
const at = (itemIndex: number, slideIndex: number) => ({ setlist, itemIndex, slideIndex })

describe('nav', () => {
  it('next: 곡 안 → 다음 장, 곡 끝 → 다음 곡(빈 곡 건너뜀), 마지막 → null', () => {
    expect(nav.next(at(0, 0))).toEqual({ itemIndex: 0, slideIndex: 1 })
    expect(nav.next(at(0, 2))).toEqual({ itemIndex: 2, slideIndex: 0 })
    expect(nav.next(at(2, 1))).toBeNull()
  })
  it('prev: 곡 처음 → 이전 곡 마지막 장', () => {
    expect(nav.prev(at(2, 0))).toEqual({ itemIndex: 0, slideIndex: 2 })
    expect(nav.prev(at(0, 0))).toBeNull()
  })
  it('prevSong: 곡 중간이면 현재 곡 첫 장, 첫 장이면 이전 곡', () => {
    expect(nav.prevSong(at(2, 1))).toEqual({ itemIndex: 2, slideIndex: 0 })
    expect(nav.prevSong(at(2, 0))).toEqual({ itemIndex: 0, slideIndex: 0 })
  })
  it('nextSong / nth', () => {
    expect(nav.nextSong(at(0, 1))).toEqual({ itemIndex: 2, slideIndex: 0 })
    expect(nav.nth(at(0, 0), 3)).toEqual({ itemIndex: 0, slideIndex: 2 })
    expect(nav.nth(at(0, 0), 4)).toBeNull()
  })
  it('빈 콘티', () => {
    expect(nav.next({ setlist: [], itemIndex: 0, slideIndex: 0 })).toBeNull()
    expect(nav.currentText({ setlist: [], itemIndex: 0, slideIndex: 0 })).toBeNull()
  })
})
