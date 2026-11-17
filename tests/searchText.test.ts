import { describe, it, expect } from 'vitest'
import { searchKey, titleMatches } from '../shared/searchText'

describe('채널 제목 검색(대소문자·띄어쓰기 무시)', () => {
  it("'abc' === 'a bc' === 'A   bc'", () => {
    expect(searchKey('abc')).toBe(searchKey('a bc'))
    expect(searchKey('a bc')).toBe(searchKey('A   bc'))
  })
  it('포함 검색 — 띄어쓰기가 달라도', () => {
    expect(titleMatches('주일 2부 예배', '주일2부')).toBe(true)
    expect(titleMatches('Lorem Ipsum', '  lo REM ')).toBe(true)
    expect(titleMatches('Lorem Ipsum', 'dolor')).toBe(false)
  })
  it('빈 검색어는 전부 일치', () => {
    expect(titleMatches('아무 제목', '   ')).toBe(true)
  })
  it('한글 조합 방식(NFD/NFC)이 달라도 일치', () => {
    expect(titleMatches('주일 예배', '주일'.normalize('NFD'))).toBe(true)
  })
})
