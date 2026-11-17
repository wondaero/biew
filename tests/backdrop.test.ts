import { describe, it, expect } from 'vitest'
import { backdropCss, keyable, toBackdrop, KEY_BLACK, KEY_GREEN } from '../shared/backdrop'

describe('송출 배경', () => {
  it('단색·그라데이션 CSS', () => {
    expect(backdropCss({ kind: 'solid', color: '#123456' })).toBe('#123456')
    expect(backdropCss({ kind: 'gradient', from: '#111111', to: '#222222', direction: 'to bottom right' })).toBe('linear-gradient(to bottom right, #111111, #222222)')
  })
  it('ATEM 키잉 가능: 검정(루마)·초록(크로마) 단색만', () => {
    expect(keyable({ kind: 'solid', color: KEY_BLACK })).toBe('luma')
    expect(keyable({ kind: 'solid', color: KEY_GREEN.toUpperCase() })).toBe('chroma')
    expect(keyable({ kind: 'solid', color: '#123456' })).toBeNull()
    expect(keyable({ kind: 'gradient', from: KEY_BLACK, to: KEY_BLACK, direction: 'to bottom' })).toBeNull()
  })
  it("예전 저장값('black'/'green')을 이어받는다", () => {
    expect(toBackdrop(undefined, 'green')).toEqual({ kind: 'solid', color: KEY_GREEN })
    expect(toBackdrop(undefined, 'black')).toEqual({ kind: 'solid', color: KEY_BLACK })
    expect(toBackdrop(undefined, undefined)).toEqual({ kind: 'solid', color: KEY_BLACK })
  })
  it('잘못된 값(색 형식·방향·종류)은 기본 검정으로', () => {
    expect(toBackdrop({ kind: 'solid', color: 'red' })).toEqual({ kind: 'solid', color: KEY_BLACK })
    expect(toBackdrop({ kind: 'gradient', from: '#111111', to: '#222222', direction: 'sideways' })).toEqual({ kind: 'solid', color: KEY_BLACK })
    expect(toBackdrop({ kind: 'image', url: 'x' })).toEqual({ kind: 'solid', color: KEY_BLACK })
  })
})
