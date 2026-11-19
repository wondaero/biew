import { describe, it, expect } from 'vitest'
import { diffSongs, diffLines, segment, diffSummary } from '../shared/songDiff'

describe('segment', () => {
  it('앞뒤 공통을 빼고 가운데만', () => {
    expect(segment('Lorem ipsum dolor', 'Lorem ipsam dolor')).toEqual({ pre: 'Lorem ips', a: 'u', b: 'a', suf: 'm dolor' })
  })
  it('한글(서로게이트 없는 문자)·추가만', () => {
    expect(segment('가나다', '가나다라')).toEqual({ pre: '가나다', a: '', b: '라', suf: '' })
  })
})

describe('diffLines', () => {
  it('바뀐 줄·추가된 줄', () => {
    const d = diffLines('A\nB\nC', 'A\nBx\nC\nD')
    expect(d.map((x) => x.kind)).toEqual(['same', 'changed', 'same', 'added'])
  })
})

describe('diffSongs', () => {
  const base = { title: 'Lorem', slides: ['S1', 'S2', 'S3'] }
  it('같으면 count 0', () => {
    const d = diffSongs(base, { ...base })
    expect(d.count).toBe(0)
    expect(diffSummary(d)).toBe('같음')
  })
  it('중간에 장 하나 끼워 넣어도 뒤 장은 같음으로', () => {
    const d = diffSongs(base, { title: 'Lorem', slides: ['S1', 'NEW', 'S2', 'S3'] })
    expect(d.slides.map((s) => s.kind)).toEqual(['same', 'added', 'same', 'same'])
    expect(diffSummary(d)).toBe('2장 추가')
  })
  it('장 안의 줄이 바뀜 + 제목 + 삭제', () => {
    const d = diffSongs({ title: 'Lorem', slides: ['a\nb', 'S2', 'S3'] }, { title: 'Lorem 2', slides: ['a\nbb', 'S3'] })
    expect(d.title).toEqual({ a: 'Lorem', b: 'Lorem 2' })
    expect(d.slides.map((s) => s.kind)).toEqual(['changed', 'removed', 'same'])
    const c = d.slides[0]!
    expect(c.kind === 'changed' ? c.lines.map((l) => l.kind) : null).toEqual(['same', 'changed'])
    expect(d.count).toBe(3)
    expect(diffSummary(d)).toBe('제목 · 1장 · 2장 삭제')
  })
})
