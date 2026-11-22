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

describe('장 삭제(pieces = [])', () => {
  it('지우면 목록에서 빠짐(후렴 여러 곳도)', () => {
    expect(replaceSlides(['A', 'B', 'C'], [1], [])).toEqual(['A', 'C'])
    expect(replaceSlides(['V', 'C', 'V2', 'C'], [1, 3], [])).toEqual(['V', 'V2'])
  })
  it('위치: 앞을 지우면 당겨짐, 뒤를 지우면 그대로, 그 장이면 당겨진 다음 장, 마지막이면 앞 장', () => {
    expect(remapIndex(2, [0], 0, 2)).toBe(1) // C(3번째) → 2번째
    expect(remapIndex(0, [2], 0, 2)).toBe(0)
    expect(remapIndex(1, [1], 0, 2)).toBe(1) // B 를 지움 → 그 자리의 C
    expect(remapIndex(2, [2], 0, 2)).toBe(1) // 마지막 C 를 지움 → 앞 장 B
    expect(remapIndex(3, [1, 3], 0, 2)).toBe(1) // 둘째 후렴(마지막) 지움 → 앞 장
  })
  it('곡 원본: 그 장만 지움, 다 지워지면 원본은 건드리지 않음(null)', () => {
    expect(patchSongSlides(['A', 'B', 'C'], 1, 'B', [], false)).toEqual(['A', 'C'])
    expect(patchSongSlides(['B', 'B'], 0, 'B', [], true)).toBeNull()
  })
})
