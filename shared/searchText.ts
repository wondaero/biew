/**
 * 제목 검색 비교 키: 대소문자·띄어쓰기를 전부 무시하고, 한글 조합 방식(NFC)을 통일한다.
 *   'abc' === 'a bc' === 'A   bc'
 * 포함 검색: 검색어 키가 제목 키 안에 있으면 일치.
 */
export const searchKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, '')

export const titleMatches = (title: string, query: string) => {
  const q = searchKey(query)
  return !q || searchKey(title).includes(q)
}
