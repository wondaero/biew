/**
 * PWA 아이콘(public/icons/*.png) 생성 — 외부 이미지 도구 없이 PNG 를 직접 인코딩.
 *   npx tsx scripts/make-icons.ts
 * 디자인은 파비콘과 같다: 어두운 바탕 + 아래쪽 흰 자막 줄(그 위에 옅은 줄 하나).
 * maskable(안드로이드/Windows 가 모양을 잘라냄) 겸용이라 바탕은 꽉 채우고 그림은 가운데 안전 영역 안에 둔다.
 */
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [0x14, 0x14, 0x18]
const WHITE = [0xff, 0xff, 0xff]
const SOFT = [0x8b, 0x8b, 0x96]

function png(size: number): Buffer {
  const px = (x: number, y: number): number[] => {
    const u = x / size, v = y / size
    if (u >= 0.25 && u <= 0.75 && v >= 0.6 && v <= 0.67) return WHITE // 자막 줄
    if (u >= 0.32 && u <= 0.68 && v >= 0.5 && v <= 0.545) return SOFT // 윗줄
    return BG
  }
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < size; x++) raw.set(px(x, y), row + 1 + x * 3)
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8bit, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s))
writeFileSync('public/icons/apple-touch-icon.png', png(180))
console.log('public/icons 생성: icon-192.png, icon-512.png, apple-touch-icon.png')
