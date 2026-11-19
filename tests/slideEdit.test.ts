import { describe, it, expect } from 'vitest'
import { parseSlideEdit, sameTextIndexes, patchSongSlides, replaceSlides, remapIndex } from '../src/control/slideEdit'

describe('parseSlideEdit', () => {
  it('줄 끝 공백·앞뒤 빈 줄·CRLF 정리 → 한 장', () => {
    expect(parseSlideEdit('\r\nLorem  \r\nipsum\n\n')).toEqual(['Lorem\nipsum'])
  })
  it('빈 줄 = 나누기(공백만 있는 줄도)', () => {
    expect(parseSlideEdit('Lorem\n\nipsum')).toEqual(['Lorem', 'ipsum'])
    expect(parseSlideEdit('Lorem\n  \nipsum\n\n\nSed')).toEqual(['Lorem', 'ipsum', 'Sed'])
  })
  it('빈 글은 null', () => {
    expect(parseSlideEdit('  \n ')).toBeNull()
  })
})

describe('replaceSlides · remapIndex', () => {
  it('한 장을 둘로', () => {
    expect(replaceSlides(['A', 'B', 'C'], [0], ['A1', 'A2'])).toEqual(['A1', 'A2', 'B', 'C'])
  })
  it('송출 중 장 번호: 앞에서 나누면 뒤로 밀림, 뒤에서 나누면 그대로, 그 장 자체면 첫 장', () => {
    expect(remapIndex(2, [0], 2)).toBe(3) // 3/5 송출 중 1장 나눔 → 4/6 (같은 글)
    expect(remapIndex(2, [4], 2)).toBe(2) // 5장 나눔 → 3/6
    expect(remapIndex(2, [2], 3)).toBe(2) // 송출 중인 장을 3장으로 → 첫 장
  })
  it('같은 글 여러 곳(후렴)을 나누면 그만큼 밀림', () => {
    const s = ['V1', 'C', 'V2', 'C', 'E']
    expect(replaceSlides(s, [1, 3], ['C1', 'C2'])).toEqual(['V1', 'C1', 'C2', 'V2', 'C1', 'C2', 'E'])
    expect(remapIndex(4, [1, 3], 2)).toBe(6) // E: 원래 5번째 → 7번째
    expect(remapIndex(3, [1, 3], 2)).toBe(4) // 둘째 후렴 → 그 후렴의 첫 장
  })
})

describe('patchSongSlides', () => {
  const song = ['A', 'B', 'C', 'B']
  it('같은 번호가 같은 글이면 그 장만', () => {
    expect(patchSongSlides(song, 3, 'B', ['X'], false)).toEqual(['A', 'B', 'C', 'X'])
  })
  it('all 이면 같은 글 전부', () => {
    expect(patchSongSlides(song, 1, 'B', ['X'], true)).toEqual(['A', 'X', 'C', 'X'])
  })
  it('나누기: 그 자리에 여러 장', () => {
    expect(patchSongSlides(song, 0, 'A', ['A1', 'A2'], false)).toEqual(['A1', 'A2', 'B', 'C', 'B'])
  })
  it('번호가 어긋나도 그 글이 딱 한 장이면 그 장', () => {
    expect(patchSongSlides(song, 0, 'C', ['X'], false)).toEqual(['A', 'B', 'X', 'B'])
  })
  it('번호가 어긋나고 같은 글이 여러 장이면 모름 → null', () => {
    expect(patchSongSlides(song, 0, 'B', ['X'], false)).toBeNull()
  })
  it('원본에 그 글이 없으면(그 사이 바뀜) null', () => {
    expect(patchSongSlides(song, 0, 'Z', ['X'], true)).toBeNull()
  })
  it('sameTextIndexes', () => {
    expect(sameTextIndexes(song, 'B')).toEqual([1, 3])
  })
})
