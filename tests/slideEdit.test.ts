import { describe, it, expect } from 'vitest'
import { parseSlideEdit, sameTextIndexes, replaceSlides, remapIndex, duplicateAt, duplicateIndex, moveAt, moveIndex } from '../src/control/slideEdit'

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
})

describe('장 복사 · 순서 바꾸기', () => {
  it('복사: 바로 뒤에 같은 장, 뒤쪽 위치만 한 칸 밀림', () => {
    expect(duplicateAt(['A', 'B', 'C'], 1)).toEqual(['A', 'B', 'B', 'C'])
    expect([0, 1, 2].map((x) => duplicateIndex(x, 1))).toEqual([0, 1, 3])
  })
  it('이동: 앞→뒤, 뒤→앞, 위치는 같은 장을 따라감', () => {
    expect(moveAt(['A', 'B', 'C', 'D'], 0, 2)).toEqual(['B', 'C', 'A', 'D'])
    expect(moveAt(['A', 'B', 'C', 'D'], 3, 1)).toEqual(['A', 'D', 'B', 'C'])
    // A(0)→2: A 를 가리키던 0 → 2, B(1)→0, C(2)→1, D 그대로
    expect([0, 1, 2, 3].map((x) => moveIndex(x, 0, 2))).toEqual([2, 0, 1, 3])
    // D(3)→1: D → 1, B(1)→2, C(2)→3, A 그대로
    expect([0, 1, 2, 3].map((x) => moveIndex(x, 3, 1))).toEqual([0, 2, 3, 1])
  })
})
