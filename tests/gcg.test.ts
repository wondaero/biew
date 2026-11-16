import { describe, it, expect } from 'vitest'
import { Buffer } from 'node:buffer'
import iconv from 'iconv-lite'
import { parseGcg } from '../shared/gcg/parse'
import { decodeFileName } from '../shared/gcg/filename'
import { buildGcg, encodeSlide } from '../scripts/make-fixture'

describe('parseGcg', () => {
  it('슬라이드를 순서대로 추출하고 앞뒤 줄바꿈을 trim', () => {
    const slides = ['Lorem ipsum\ndolor sit', 'Amet consectetur']
    const r = parseGcg(buildGcg(slides))
    expect(r.hasMagic).toBe(true)
    expect(r.slides).toEqual(slides)
  })
  it('연속 중복 슬라이드는 유지', () => {
    expect(parseGcg(buildGcg(['Lorem', 'Lorem', 'Ipsum'])).slides).toEqual(['Lorem', 'Lorem', 'Ipsum'])
  })
  it('레코드 2개 이하는 무시', () => {
    const raw = (t: string) => new Uint8Array([9, ...encodeSlide(t), 9, 9, 9, 9, 9, 9, 9, 9, 9, 9])
    expect(parseGcg(raw('ab')).slides).toEqual([])
    expect(parseGcg(raw('abc')).slides).toEqual(['abc'])
  })
  it('줄바꿈만 있는 묶음은 emptyBlocks', () => {
    const d = new Uint8Array([...buildGcg([]), ...encodeSlide('\n\n\n'), 9, 9, 9])
    const r = parseGcg(d)
    expect(r.slides).toEqual([])
    expect(r.emptyBlocks).toBe(1)
  })
  it('한글(BMP) 처리', () => {
    expect(parseGcg(buildGcg(['가나다\n라마바'])).slides).toEqual(['가나다\n라마바'])
  })
})

describe('decodeFileName', () => {
  const cp = (b: Buffer) => iconv.decode(b, 'cp949')
  it('NFD → NFC', () => {
    const nfd = '한글 더미.gcg'.normalize('NFD')
    expect(decodeFileName(Buffer.from(nfd), cp)).toBe('한글 더미.gcg'.normalize('NFC'))
  })
  it('CP949 바이트 복구', () => {
    expect(decodeFileName(iconv.encode('주님 찬양.gcg', 'cp949'), cp)).toBe('주님 찬양.gcg')
  })
})
