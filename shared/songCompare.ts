/**
 * 곡 중복 판정 — 시스템 비교(===). AI/유사도 아님.
 * 비교 전에 '눈에 안 보이는 차이'만 통일한다: 한글 조합 방식(NFC), 줄바꿈 종류(\r\n), 줄·슬라이드 앞뒤 공백, 빈 슬라이드.
 * 띄어쓰기·글자가 하나라도 다르면 다른 곡이다.
 */
export interface SongLike { id?: string; title: string; slides: string[] }

export const normTitle = (s: string) => s.normalize('NFC').trim()

const normSlide = (s: string) =>
  s.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).join('\n').trim()

/** 가사 비교 키: 이 값이 === 이면 가사가 같다 */
export const lyricsKey = (slides: string[]) => slides.map(normSlide).filter(Boolean).join('\n\n')

export interface Duplicates<T> { sameLyrics: T[]; sameTitle: T[] }

/** pool 에서 candidate 와 가사가 같은 곡 / (가사는 다르지만) 제목이 같은 곡. candidate.id 자신은 제외 */
export function findDuplicates<T extends SongLike>(candidate: SongLike, pool: T[]): Duplicates<T> {
  const key = lyricsKey(candidate.slides)
  const title = normTitle(candidate.title)
  const sameLyrics: T[] = []
  const sameTitle: T[] = []
  for (const s of pool) {
    if (candidate.id && s.id === candidate.id) continue
    if (key && lyricsKey(s.slides) === key) sameLyrics.push(s)
    else if (title && normTitle(s.title) === title) sameTitle.push(s)
  }
  return { sameLyrics, sameTitle }
}
