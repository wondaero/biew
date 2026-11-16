import type { LiveState, SetlistItem } from '@shared/types'

export interface Cursor { itemIndex: number; slideIndex: number }
type S = Pick<LiveState, 'setlist' | 'itemIndex' | 'slideIndex'>

const hasSlides = (it: SetlistItem | undefined) => !!it && it.slides.length > 0

export function currentText(s: S): string | null {
  return s.setlist[s.itemIndex]?.slides[s.slideIndex] ?? null
}

export function textAt(setlist: SetlistItem[], c: Cursor | null): string | null {
  return c ? (setlist[c.itemIndex]?.slides[c.slideIndex] ?? null) : null
}

/** 다음 슬라이드. 곡 끝이면 다음 곡(슬라이드 있는) 첫 장. 끝이면 null */
export function next(s: S): Cursor | null {
  const cur = s.setlist[s.itemIndex]
  if (cur && s.slideIndex + 1 < cur.slides.length) return { itemIndex: s.itemIndex, slideIndex: s.slideIndex + 1 }
  for (let i = s.itemIndex + 1; i < s.setlist.length; i++) if (hasSlides(s.setlist[i])) return { itemIndex: i, slideIndex: 0 }
  return null
}

/** 이전 슬라이드. 곡 처음이면 이전 곡 마지막 장 */
export function prev(s: S): Cursor | null {
  if (s.slideIndex > 0 && s.setlist[s.itemIndex]) return { itemIndex: s.itemIndex, slideIndex: s.slideIndex - 1 }
  for (let i = s.itemIndex - 1; i >= 0; i--) {
    const it = s.setlist[i]
    if (hasSlides(it)) return { itemIndex: i, slideIndex: it!.slides.length - 1 }
  }
  return null
}

export function nextSong(s: S): Cursor | null {
  for (let i = s.itemIndex + 1; i < s.setlist.length; i++) if (hasSlides(s.setlist[i])) return { itemIndex: i, slideIndex: 0 }
  return null
}

/** 이전 곡 첫 장. 단, 현재 곡 중간이면 현재 곡 첫 장(일반적인 '처음으로' 동작) */
export function prevSong(s: S): Cursor | null {
  if (s.slideIndex > 0 && hasSlides(s.setlist[s.itemIndex])) return { itemIndex: s.itemIndex, slideIndex: 0 }
  for (let i = s.itemIndex - 1; i >= 0; i--) if (hasSlides(s.setlist[i])) return { itemIndex: i, slideIndex: 0 }
  return null
}

/** 현재 곡의 N번째(1-based) */
export function nth(s: S, n: number): Cursor | null {
  const cur = s.setlist[s.itemIndex]
  if (!cur || n < 1 || n > cur.slides.length) return null
  return { itemIndex: s.itemIndex, slideIndex: n - 1 }
}
