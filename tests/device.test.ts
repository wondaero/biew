import { describe, it, expect } from 'vitest'
import { isMobileOS } from '../src/lib/device'

const UA = {
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linuxDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
}

describe('모바일 OS 판정(출력 창 경고용)', () => {
  it('윈도우 PC — 터치 노트북(터치 포인트 10)이어도 PC', () => {
    expect(isMobileOS({ userAgent: UA.winChrome, maxTouchPoints: 0 })).toBe(false)
    expect(isMobileOS({ userAgent: UA.winChrome, maxTouchPoints: 10, uaData: { mobile: false, platform: 'Windows' } })).toBe(false)
  })
  it('맥(터치 없음)은 PC, 터치 되는 맥 UA 는 아이패드', () => {
    expect(isMobileOS({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe(false)
    expect(isMobileOS({ userAgent: UA.macSafari, maxTouchPoints: 5 })).toBe(true)
  })
  it('안드로이드 폰·아이폰', () => {
    expect(isMobileOS({ userAgent: UA.androidPhone, maxTouchPoints: 5 })).toBe(true)
    expect(isMobileOS({ userAgent: UA.iphone, maxTouchPoints: 5 })).toBe(true)
  })
  it('안드로이드 태블릿 데스크톱 모드(UA 는 리눅스) — userAgentData 로 잡음', () => {
    expect(isMobileOS({ userAgent: UA.linuxDesktop, maxTouchPoints: 5, uaData: { mobile: false, platform: 'Android' } })).toBe(true)
  })
  it('리눅스 데스크톱은 PC', () => {
    expect(isMobileOS({ userAgent: UA.linuxDesktop, maxTouchPoints: 0, uaData: { mobile: false, platform: 'Linux' } })).toBe(false)
  })
})
