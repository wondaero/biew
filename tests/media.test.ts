import { describe, it, expect } from 'vitest'
import { mediaSlide, isMediaSlide, mediaIdOf, isMediaItem, referencedMedia, naturalCompare, MEDIA_SONG_ID } from '../shared/media'
import * as nav from '../src/live/nav'

describe('그림 슬라이드 표시', () => {
  it('만들기·알아보기·id', () => {
    const s = mediaSlide('abc')
    expect(isMediaSlide(s)).toBe(true)
    expect(mediaIdOf(s)).toBe('abc')
    expect(isMediaSlide('Lorem ipsum')).toBe(false)
    expect(isMediaSlide(null)).toBe(false)
  })
  it('그림 묶음 항목', () => {
    expect(isMediaItem({ songId: MEDIA_SONG_ID, slides: [] })).toBe(true)
    expect(isMediaItem({ songId: 'x', slides: [mediaSlide('a'), mediaSlide('b')] })).toBe(true)
    expect(isMediaItem({ songId: 'x', slides: ['Lorem', mediaSlide('b')] })).toBe(false)
  })
  it('쓰는 그림 모으기(여러 저장본, 깨진 값 무시)', () => {
    const used = referencedMedia([
      { setlist: [{ slides: [mediaSlide('a'), 'Lorem'] }] },
      { setlist: [{ slides: [mediaSlide('b'), 3] }, {}] },
      {},
    ])
    expect([...used].sort()).toEqual(['a', 'b'])
  })
  it('파일 이름 자연 정렬(슬라이드2 < 슬라이드10)', () => {
    expect(['슬라이드10.PNG', '슬라이드2.PNG', '슬라이드1.PNG'].sort(naturalCompare)).toEqual(['슬라이드1.PNG', '슬라이드2.PNG', '슬라이드10.PNG'])
  })
  it('이동·FREEZE 는 가사와 똑같이(글에 그림 표시가 들어 있으므로)', () => {
    const setlist = [{ key: 'k', songId: MEDIA_SONG_ID, title: 'Lorem', slides: [mediaSlide('a'), mediaSlide('b')] }]
    const s = { setlist, itemIndex: 0, slideIndex: 0, blank: false, frozen: null }
    expect(nav.next(s)).toEqual({ itemIndex: 0, slideIndex: 1 })
    expect(nav.onAir({ ...s, slideIndex: 1 }).text).toBe(mediaSlide('b'))
  })
})

import { referencedMedia as refMedia2, mediaSlide as ms2 } from '../shared/media'
describe('그림 정리: 쓰는 중인 그림', () => {
  it('선곡의 그림 + FREEZE 로 걸어 둔 그림(선곡에서 빠졌어도)', () => {
    const used = refMedia2([
      { setlist: [{ slides: [ms2('aaaaaaaa'), 'Lorem'] }], frozen: { text: ms2('bbbbbbbb') } },
      { setlist: [], frozen: null },
      { setlist: [{ slides: [ms2('cccccccc')] }] },
    ])
    expect([...used].sort()).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc'])
  })
})
