import { describe, it, expect } from 'vitest'
import { findDuplicates, lyricsKey, normTitle } from '../shared/songCompare'

const pool = [
  { id: 'a', title: 'Lorem Alpha', slides: ['Lorem ipsum\ndolor sit', 'Sed do eiusmod'] },
  { id: 'b', title: 'Ipsum Beta', slides: ['Ut enim ad minim'] },
]

describe('곡 중복 판정 (시스템 비교)', () => {
  it('가사가 같으면 sameLyrics — 줄바꿈 종류·앞뒤 공백·빈 슬라이드·NFC 차이는 무시', () => {
    const d = findDuplicates({ title: '다른 제목', slides: ['  Lorem ipsum \r\ndolor sit  ', '', 'Sed do eiusmod\n'] }, pool)
    expect(d.sameLyrics.map((s) => s.id)).toEqual(['a'])
    expect(d.sameTitle).toEqual([])
  })
  it('가사는 다르고 제목이 같으면 sameTitle', () => {
    const d = findDuplicates({ title: ' Ipsum Beta ', slides: ['Duis aute irure'] }, pool)
    expect(d.sameLyrics).toEqual([])
    expect(d.sameTitle.map((s) => s.id)).toEqual(['b'])
  })
  it('띄어쓰기·글자가 하나라도 다르면 다른 곡(유사도 아님)', () => {
    expect(findDuplicates({ title: 'IpsumBeta', slides: ['Ut enim ad  minim'] }, pool)).toEqual({ sameLyrics: [], sameTitle: [] })
    expect(findDuplicates({ title: 'ipsum beta', slides: ['x'] }, pool).sameTitle).toEqual([]) // 대소문자도 다름
  })
  it('자기 자신(같은 id)은 중복이 아니다', () => {
    expect(findDuplicates(pool[0]!, pool).sameLyrics).toEqual([]) // pool[0].id === 'a'
  })
  it('한글 조합 방식(NFD/NFC)이 달라도 같은 글자면 같다', () => {
    const nfc = '가나' // 가나
    const nfd = nfc.normalize('NFD')
    expect(normTitle(nfd)).toBe(normTitle(nfc))
    expect(lyricsKey([nfd])).toBe(lyricsKey([nfc]))
  })
})
