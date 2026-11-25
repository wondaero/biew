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
  it('빈 선곡', () => {
    expect(nav.next({ setlist: [], itemIndex: 0, slideIndex: 0 })).toBeNull()
    expect(nav.currentText({ setlist: [], itemIndex: 0, slideIndex: 0 })).toBeNull()
  })
})

describe('onAir (FREEZE)', () => {
  const base = { setlist, itemIndex: 2, slideIndex: 1, blank: false }
  it('freeze 아니면 컨트롤러 위치를 그대로 송출', () => {
    expect(nav.onAir({ ...base, frozen: null })).toEqual({ itemIndex: 2, slideIndex: 1, blank: false, text: 'Lorem 1', frozen: false })
    expect(nav.onAir(base)).toMatchObject({ frozen: false }) // 예전 저장 상태(필드 없음)
  })
  it('freeze 중엔 컨트롤러가 움직이고 blank 여도 고정된 화면(텍스트 스냅샷)을 유지', () => {
    const frozen = { itemIndex: 0, slideIndex: 0, blank: false, text: 'Lorem 0 (snapshot)' }
    const a = nav.onAir({ ...base, blank: true, frozen })
    expect(a).toEqual({ itemIndex: 0, slideIndex: 0, blank: false, text: 'Lorem 0 (snapshot)', frozen: true })
  })
})

describe('송출 대기(slideIndex -1) — 2026-11-25', () => {
  const sl = [
    { key: 'a', songId: 'a', title: 'A', slides: ['a1', 'a2'] },
    { key: 'b', songId: 'b', title: 'B', slides: ['b1', 'b2'] },
  ]
  it('대기 = 빈 화면(글 없음), BLANK 와 별개', async () => {
    const nav = await import('../src/live/nav')
    const s = { setlist: sl, itemIndex: 0, slideIndex: -1, blank: false, frozen: null }
    expect(nav.isIdle(s)).toBe(true)
    expect(nav.currentText(s)).toBeNull()
    expect(nav.onAir(s).blank).toBe(false)
  })
  it('▶ = 그 곡 첫 장, ◀ = 이전 곡 마지막 장(없으면 그대로)', async () => {
    const nav = await import('../src/live/nav')
    expect(nav.next({ setlist: sl, itemIndex: 0, slideIndex: -1 })).toEqual({ itemIndex: 0, slideIndex: 0 })
    expect(nav.prev({ setlist: sl, itemIndex: 1, slideIndex: -1 })).toEqual({ itemIndex: 0, slideIndex: 1 })
    expect(nav.prev({ setlist: sl, itemIndex: 0, slideIndex: -1 })).toBeNull()
  })
})
