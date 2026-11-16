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
