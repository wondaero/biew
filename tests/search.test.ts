import { describe, it, expect } from 'vitest'
import { buildIndex, search, normalize } from '../src/library/search'
import type { Song } from '../shared/types'

const song = (id: string, title: string, slides: string[]): Song => ({ id, title, slides, source_file: null, updated_at: '', deleted_at: null })
const songs = [
  song('1', '001 Lorem Ipsum', ['dolor sit amet', 'consectetur']),
  song('2', '002 Dolor Magna', ['lorem ipsum in body']),
  song('3', '003 가나다 찬양', ['라마바 사아\n자차카']),
]

describe('search', () => {
  const idx = buildIndex(songs)
  it('제목 매치가 가사 매치보다 위', () => {
    expect(search(idx, 'lorem').map((h) => h.song.id)).toEqual(['1', '2'])
  })
  it('공백 무시 / 여러 토큰 AND', () => {
    expect(search(idx, '가나 다').map((h) => h.song.id)).toEqual(['3'])
    expect(search(idx, '사아자차').map((h) => h.song.id)).toEqual(['3'])
    expect(search(idx, 'lorem consectetur').map((h) => h.song.id)).toEqual(['1'])
  })
  it('번호 검색', () => {
    expect(search(idx, '002')[0]?.song.id).toBe('2')
  })
  it('NFD 입력도 매치', () => {
    expect(normalize('가나다'.normalize('NFD'))).toBe('가나다')
  })
  it('2000곡 검색 성능 (< 30ms)', () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      song(String(i), `${i} Lorem ipsum ${i % 97}`, Array.from({ length: 6 }, (_, k) => `Lorem ipsum dolor sit amet ${i} ${k}\nconsectetur adipiscing elit sed do`)),
    )
    const big = buildIndex(many)
    const t0 = performance.now()
    for (let k = 0; k < 10; k++) search(big, 'adipiscing 1999')
    expect((performance.now() - t0) / 10).toBeLessThan(30)
  })
})
