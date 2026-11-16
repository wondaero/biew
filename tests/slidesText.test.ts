import { describe, it, expect } from 'vitest'
import { textToSlides, slidesToText } from '../shared/slidesText'

describe('textToSlides', () => {
  it('빈 줄로 슬라이드 구분, 줄바꿈 유지', () => {
    expect(textToSlides('Lorem\nipsum\n\nDolor\nsit')).toEqual(['Lorem\nipsum', 'Dolor\nsit'])
  })
  it('여러 빈 줄 / 공백만 있는 줄 / CRLF / 앞뒤 빈 줄', () => {
    expect(textToSlides('\r\n\r\nLorem  \r\n \r\n\n\nIpsum\n\n')).toEqual(['Lorem', 'Ipsum'])
  })
  it('연속 중복 슬라이드 유지', () => {
    expect(textToSlides('Lorem\n\nLorem\n\nIpsum')).toEqual(['Lorem', 'Lorem', 'Ipsum'])
  })
  it('빈 입력', () => {
    expect(textToSlides('  \n \n')).toEqual([])
  })
  it('왕복 변환 보존', () => {
    const slides = ['Lorem\nipsum', 'Dolor', 'Dolor', 'Sit\namet\nconsectetur']
    expect(textToSlides(slidesToText(slides))).toEqual(slides)
  })
})

import { slideRanges, slideIndexAt } from '../shared/slidesText'

describe('slideRanges', () => {
  const cases = [
    'Lorem\nipsum\n\nDolor\nsit',
    '\n\nLorem  \n \n\n\nIpsum\n\n',
    'Lorem\n\nLorem\n\n\n\nIpsum',
    'A\r\n\r\nB',
    'single',
    '',
  ]
  it.each(cases)('슬라이드 개수와 내용이 textToSlides 와 일치: %j', (t) => {
    const r = slideRanges(t)
    const slides = textToSlides(t)
    expect(r.length).toBe(slides.length)
    r.forEach((x, i) => expect(textToSlides(t.slice(x.start, x.end))[0]).toBe(slides[i]))
  })
  it('커서 → 슬라이드 번호', () => {
    const t = 'Lorem\n\nIpsum\n\nDolor'
    const r = slideRanges(t)
    expect(slideIndexAt(r, 0)).toBe(0)
    expect(slideIndexAt(r, t.indexOf('Ipsum') + 2)).toBe(1)
    expect(slideIndexAt(r, t.length)).toBe(2)
  })
})
