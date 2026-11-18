import { describe, it, expect } from 'vitest'
import { toLoginEmail, LOGIN_DOMAIN } from '../shared/loginId'

describe('로그인 아이디 → 이메일', () => {
  it('아이디만 → 도메인 붙임', () => {
    expect(toLoginEmail('lorem')).toBe(`lorem@${LOGIN_DOMAIN}`)
  })
  it('앞뒤 공백·대문자 정리', () => {
    expect(toLoginEmail('  Lorem ')).toBe(`lorem@${LOGIN_DOMAIN}`)
  })
  it('전체 이메일은 그대로(다른 도메인 포함)', () => {
    expect(toLoginEmail('ipsum@example.test')).toBe('ipsum@example.test')
    expect(toLoginEmail(`lorem@${LOGIN_DOMAIN}`)).toBe(`lorem@${LOGIN_DOMAIN}`)
  })
  it('빈 입력 → 빈 문자열', () => {
    expect(toLoginEmail('   ')).toBe('')
  })
})
