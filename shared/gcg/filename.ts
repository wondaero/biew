import type { Buffer } from 'node:buffer'

/** 파일명 바이트 → 제목. UTF-8 이 아니면 CP949 로 해석. 항상 NFC 로 정규화(macOS NFD 대비). */
export function decodeFileName(raw: Buffer, decodeCp949: (b: Buffer) => string): string {
  let s: string
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    s = decodeCp949(raw)
  }
  return s.normalize('NFC')
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.gcg$/i, '').trim()
}
