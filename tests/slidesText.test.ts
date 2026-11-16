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
