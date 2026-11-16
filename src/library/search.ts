import type { Song } from '@shared/types'

/** NFC + 소문자 + 공백/문장부호 제거. "주 님의" ≒ "주님의" */
export function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

export interface IndexedSong { song: Song; t: string; b: string }

export function buildIndex(songs: Song[]): IndexedSong[] {
  return songs.map((song) => ({ song, t: normalize(song.title), b: normalize(song.slides.join(' ')) }))
}

export interface Hit { song: Song; inTitle: boolean; score: number }

/**
 * 공백으로 나눈 모든 토큰이 (제목+가사)에 포함되어야 매치.
 * 점수: 제목 시작 > 제목 포함 > 가사만.
 */
export function search(index: IndexedSong[], query: string, limit = 50): Hit[] {
  const tokens = query.split(/\s+/).map(normalize).filter(Boolean)
  if (!tokens.length) return []
  const whole = normalize(query)
  const hits: Hit[] = []
  for (const x of index) {
    let ok = true, titleAll = true
    for (const tk of tokens) {
      const inT = x.t.includes(tk)
      if (!inT) titleAll = false
      if (!inT && !x.b.includes(tk)) { ok = false; break }
    }
    if (!ok) continue
    const score = x.t.startsWith(whole) ? 3 : x.t.includes(whole) ? 2 : titleAll ? 1.5 : x.b.includes(whole) ? 1 : 0.5
    hits.push({ song: x.song, inTitle: titleAll, score })
  }
  hits.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, 'ko'))
  return hits.slice(0, limit)
}
