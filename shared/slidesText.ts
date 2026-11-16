/**
 * 편집기 텍스트 ↔ 슬라이드 배열.
 * 빈 줄(공백만 있는 줄 포함) = 슬라이드 구분. 각 줄 끝 공백 제거, 슬라이드 앞뒤 빈 줄 제거.
 * 연속 중복 슬라이드는 의도된 것이므로 그대로 둔다.
 */
export function textToSlides(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t　]*\n/)
    .map((s) => s.split('\n').map((l) => l.replace(/[ \t　]+$/, '')).join('\n').replace(/^\n+|\n+$/g, ''))
    .filter((s) => s.trim().length > 0)
}

export function slidesToText(slides: string[]): string {
  return slides.join('\n\n')
}

/**
 * 각 슬라이드가 원문 텍스트의 어디에 있는지 [start, end) — textToSlides 와 같은 순서/개수.
 * 편집기에서 커서 위치 ↔ 미리보기 슬라이드 연결에 사용.
 */
export function slideRanges(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const sep = /\r?\n[ \t　]*\r?\n/g
  let pos = 0
  const push = (a: number, b: number) => {
    const chunk = text.slice(a, b)
    if (!chunk.trim()) return
    const lead = chunk.length - chunk.replace(/^[\r\n]+/, '').length
    const trail = chunk.length - chunk.replace(/[\s　]+$/, '').length
    out.push({ start: a + lead, end: b - trail })
  }
  for (let m; (m = sep.exec(text)); ) {
    push(pos, m.index)
    pos = m.index + m[0].length
    sep.lastIndex = pos - 1 // "\n\n\n" 처럼 겹치는 구분자도 한 번에 소비되도록 마지막 \n 을 다시 보게 함
    if (sep.lastIndex <= m.index) sep.lastIndex = pos
  }
  push(pos, text.length)
  return out
}

/** 커서 위치가 속한(또는 바로 앞의) 슬라이드 번호 */
export function slideIndexAt(ranges: { start: number; end: number }[], caret: number): number {
  let idx = -1
  for (let i = 0; i < ranges.length; i++) if (ranges[i]!.start <= caret) idx = i
  return idx
}
