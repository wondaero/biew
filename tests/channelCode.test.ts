import { describe, it, expect } from 'vitest'
import { isCode, normalizeCode, viewPath, controlPath } from '../src/channel/api'

describe('채널 번호', () => {
  it('숫자 6자리(새)와 영문 6자(예전) 모두 유효', () => {
    expect(isCode('012345')).toBe(true)
    expect(isCode('ABC234')).toBe(true)
    expect(isCode('12345')).toBe(false)
    expect(isCode('ABC214')).toBe(false) // 예전 형식엔 0·1 없음(영문과 섞이면 안 됨)
    expect(isCode('LOCAL')).toBe(false)
  })
  it('입력 정리: 공백·하이픈 제거, 대문자', () => {
    expect(normalizeCode(' 123-456 ')).toBe('123456')
    expect(normalizeCode('abc234')).toBe('ABC234')
  })
  it('숫자 번호는 짧은 주소, 예전 번호는 예전 주소', () => {
    expect(viewPath('012345')).toBe('/012345')
    expect(controlPath('012345')).toBe('/012345/control')
    expect(viewPath('ABC234')).toBe('/view/ABC234')
    expect(controlPath('ABC234')).toBe('/control/ABC234')
  })
})
