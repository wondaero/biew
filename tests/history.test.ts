import { describe, it, expect } from 'vitest'
import { historyFingerprint, stripMedia, copySetlist, defaultHistoryTitle, sameLocalDay, isSetlist } from '../shared/history'
import { mediaSlide, MEDIA_SONG_ID } from '../shared/media'

const song = (key: string, title: string, slides: string[]) => ({ key, songId: 's-' + title, title, slides })

describe('선곡 기록 규칙', () => {
  it('지문: 같은 내용이면 같고(항목 key 무시), 글 하나만 달라도 다름', () => {
    const a = [song('k1', 'Lorem', ['A', 'B'])]
    expect(historyFingerprint(a)).toBe(historyFingerprint([song('zz', 'Lorem', ['A', 'B'])]))
    expect(historyFingerprint(a)).not.toBe(historyFingerprint([song('k1', 'Lorem', ['A', 'C'])]))
    expect(historyFingerprint(a)).not.toBe(historyFingerprint([song('k1', 'Ipsum', ['A', 'B'])]))
  })
  it('서버용: 그림 묶음은 빼고 개수만', () => {
    const pic = { key: 'm', songId: MEDIA_SONG_ID, title: 'Lorem PDF', slides: [mediaSlide('abcdef12')] }
    const r = stripMedia([song('k1', 'Lorem', ['A']), pic, song('k2', 'Ipsum', ['B'])])
    expect(r.skippedMedia).toBe(1)
    expect(r.setlist.map((x) => x.title)).toEqual(['Lorem', 'Ipsum'])
  })
  it('복사해서 시작: 내용 그대로, key 는 새로(원본과 공유 안 함)', () => {
    let n = 0
    const src = [song('k1', 'Lorem', ['A'])]
    const c = copySetlist(src, () => 'new' + n++)
    expect(c[0]).toMatchObject({ key: 'new0', title: 'Lorem', slides: ['A'] })
    c[0]!.slides.push('X')
    expect(src[0]!.slides).toEqual(['A'])
  })
  it('기본 이름: "월/일 제목", 제목 없으면 "예배"', () => {
    expect(defaultHistoryTitle(new Date(2026, 10, 24), '주일 2부')).toBe('11/24 주일 2부')
    expect(defaultHistoryTitle(new Date(2026, 10, 24), '  ')).toBe('11/24 예배')
  })
  it('같은 날 판정', () => {
    expect(sameLocalDay(new Date(2026, 10, 24, 1), new Date(2026, 10, 24, 23))).toBe(true)
    expect(sameLocalDay(new Date(2026, 10, 24, 23), new Date(2026, 10, 25, 0))).toBe(false)
  })
  it('받은 값 검사', () => {
    expect(isSetlist([song('k', 'L', ['A'])])).toBe(true)
    expect(isSetlist([{ title: 'L', slides: [1] }])).toBe(false)
    expect(isSetlist({})).toBe(false)
  })
})
