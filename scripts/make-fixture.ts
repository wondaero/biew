/** 테스트용 합성 .gcg 생성 (Lorem ipsum). npm run fixture -- <출력폴더> */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { GCG_MAGIC } from '../shared/gcg/parse.ts'

export function encodeSlide(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 10)
  for (let k = 0; k < text.length; k++) {
    const c = text[k] === '\n' ? 0x0d : text.charCodeAt(k)
    out.set([c & 0xff, c >> 8, 0, 0, 0, 0, 1, 0, 0, 0], k * 10)
  }
  return out
}

/** 헤더 + 잡음 + (슬라이드 사이 잡음) 형태의 가짜 파일 */
export function buildGcg(slides: string[], noise = 64): Uint8Array {
  const parts: Uint8Array[] = [new TextEncoder().encode(GCG_MAGIC), new Uint8Array(noise).fill(0x41)]
  for (const s of slides) {
    parts.push(encodeSlide('\n' + s + '\n'))
    parts.push(new Uint8Array(noise).map((_, k) => (k * 37) & 0xff)) // RGB565 흉내
  }
  const total = parts.reduce((a, p) => a + p.length, 0)
  const buf = new Uint8Array(total)
  let o = 0
  for (const p of parts) { buf.set(p, o); o += p.length }
  return buf
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'out/fixtures'
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '001 Lorem 찬양.gcg'), buildGcg(['Lorem ipsum dolor\nsit amet', 'Consectetur adipiscing\nelit sed do', 'Lorem ipsum dolor\nsit amet']))
  await writeFile(join(dir, '002 Empty.gcg'), buildGcg([]))
  await writeFile(join(dir, '003 한글 더미.gcg'.normalize('NFD')), buildGcg(['가나다라 마바사\n아자차카']))
  console.log(`fixtures → ${dir}`)
}
