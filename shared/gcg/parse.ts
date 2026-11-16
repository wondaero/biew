/**
 * GenCG(.gcg) 텍스트 추출. 기준 구현: doc/gcg_parse.py
 *
 * 텍스트 레코드(10B): [UTF-16LE 코드 2B][00 00 00 00][01 00 00 00]
 * - 코드 0x0000 은 레코드로 인정하지 않음
 * - 0x000D 는 줄바꿈
 * - 3개 이상 연속된 구간 = 슬라이드 1장, 앞뒤 줄바꿈 trim
 *
 * Python 기준과 다른 점(의도적):
 * - trim 후 빈 문자열이 되는 묶음은 슬라이드로 넣지 않고 emptyBlocks 로 센다.
 * - 서로게이트 쌍은 String.fromCharCode 로 자연스럽게 결합된다.
 */
export const GCG_MAGIC = '\x13Compix Media, Inc.'
const RECORD = 10
const MIN_RUN = 3

export interface GcgParseResult {
  slides: string[]
  emptyBlocks: number
  hasMagic: boolean
}

function isRecord(d: Uint8Array, j: number): boolean {
  return (
    (d[j] !== 0 || d[j + 1] !== 0) &&
    d[j + 2] === 0 && d[j + 3] === 0 && d[j + 4] === 0 && d[j + 5] === 0 &&
    d[j + 6] === 1 && d[j + 7] === 0 && d[j + 8] === 0 && d[j + 9] === 0
  )
}

export function hasGcgMagic(d: Uint8Array): boolean {
  if (d.length < GCG_MAGIC.length) return false
  for (let k = 0; k < GCG_MAGIC.length; k++) if (d[k] !== GCG_MAGIC.charCodeAt(k)) return false
  return true
}

export function parseGcg(d: Uint8Array): GcgParseResult {
  const slides: string[] = []
  let emptyBlocks = 0
  const n = d.length
  let i = 0
  const codes: number[] = []
  while (i < n - RECORD) {
    let j = i
    codes.length = 0
    while (j + RECORD <= n && isRecord(d, j)) {
      codes.push(d[j]! | (d[j + 1]! << 8))
      j += RECORD
    }
    if (codes.length >= MIN_RUN) {
      let txt = ''
      for (const c of codes) txt += c === 0x0d ? '\n' : String.fromCharCode(c)
      txt = txt.replace(/^\n+|\n+$/g, '')
      if (txt) slides.push(txt)
      else emptyBlocks++
      i = j
    } else {
      i += 1
    }
  }
  return { slides, emptyBlocks, hasMagic: hasGcgMagic(d) }
}
