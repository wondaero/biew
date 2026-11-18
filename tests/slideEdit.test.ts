import { describe, it, expect } from 'vitest'
import { cleanSlideText, sameTextIndexes, patchSongSlides } from '../src/control/slideEdit'

describe('cleanSlideText', () => {
  it('줄 끝 공백·앞뒤 빈 줄·CRLF 정리', () => {
    expect(cleanSlideText('\r\nLorem  \r\nipsum\n\n')).toBe('Lorem\nipsum')
  })
  it('빈 줄(슬라이드 나누기)·빈 글은 거부', () => {
    expect(cleanSlideText('Lorem\n\nipsum')).toBeNull()
    expect(cleanSlideText('Lorem\n  \nipsum')).toBeNull()
    expect(cleanSlideText('  \n ')).toBeNull()
  })
})

describe('patchSongSlides', () => {
  const song = ['A', 'B', 'C', 'B']
  it('같은 번호가 같은 글이면 그 장만', () => {
    expect(patchSongSlides(song, 3, 'B', 'X', false)).toEqual(['A', 'B', 'C', 'X'])
  })
  it('all 이면 같은 글 전부', () => {
    expect(patchSongSlides(song, 1, 'B', 'X', true)).toEqual(['A', 'X', 'C', 'X'])
  })
  it('번호가 어긋나도 그 글이 딱 한 장이면 그 장', () => {
    expect(patchSongSlides(song, 0, 'C', 'X', false)).toEqual(['A', 'B', 'X', 'B'])
  })
  it('번호가 어긋나고 같은 글이 여러 장이면 모름 → null', () => {
    expect(patchSongSlides(song, 0, 'B', 'X', false)).toBeNull()
  })
  it('원본에 그 글이 없으면(그 사이 바뀜) null', () => {
    expect(patchSongSlides(song, 0, 'Z', 'X', true)).toBeNull()
  })
  it('sameTextIndexes', () => {
    expect(sameTextIndexes(song, 'B')).toEqual([1, 3])
  })
})
