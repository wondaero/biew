/**
 * npm run import -- <gcg폴더> [--dry-run] [--out out/songs.json]
 * 폴더 내 .gcg 를 파싱해 Supabase songs 에 upsert(key: source_file).
 * ⚠️ 가사 본문은 절대 출력하지 않는다. 구조 정보만 출력.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { sep, dirname, resolve } from 'node:path'
import iconv from 'iconv-lite'
import { createClient } from '@supabase/supabase-js'
import { parseGcg } from '../shared/gcg/parse.ts'
import { decodeFileName, titleFromFileName } from '../shared/gcg/filename.ts'

interface Row { title: string; slides: string[]; source_file: string }

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const outIdx = args.indexOf('--out')
const outPath = outIdx >= 0 ? args[outIdx + 1]! : 'out/songs.json'
const dir = args.find((a, k) => !a.startsWith('--') && args[k - 1] !== '--out')

if (!dir) {
  console.error('usage: npm run import -- <gcg폴더> [--dry-run] [--out file.json]')
  process.exit(1)
}
try { process.loadEnvFile() } catch { /* .env 없음 — dry-run 이면 무관 */ }

const BATCH = 200

async function main() {
  const root = resolve(dir!)
  const entries = await readdir(root, { encoding: 'buffer', withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => ({ raw: e.name as unknown as Buffer, name: decodeFileName(e.name as unknown as Buffer, (b) => iconv.decode(b, 'cp949')) }))
    .filter((f) => /\.gcg$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const rows: Row[] = []
  const empty: string[] = []
  const failed: { file: string; reason: string }[] = []
  const noMagic: string[] = []
  let emptyBlocks = 0, slideTotal = 0, lineTotal = 0, charTotal = 0

  for (const f of files) {
    try {
      // 원본 바이트 경로 그대로 열기 (CP949 파일명도 안전)
      const buf = await readFile(Buffer.concat([Buffer.from(root + sep), f.raw]))
      const r = parseGcg(buf)
      if (!r.hasMagic) noMagic.push(f.name)
      emptyBlocks += r.emptyBlocks
      if (r.slides.length === 0) empty.push(f.name)
      for (const s of r.slides) { slideTotal++; lineTotal += s.split('\n').length; charTotal += s.length }
      rows.push({ title: titleFromFileName(f.name), slides: r.slides, source_file: f.name })
    } catch (e) {
      failed.push({ file: f.name, reason: (e as Error).message })
    }
  }

  const dupKeys = rows.length - new Set(rows.map((r) => r.source_file)).size
  if (dupKeys) throw new Error(`source_file 중복 ${dupKeys}건 — NFC 정규화 후 충돌`)

  if (dryRun) {
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, JSON.stringify(rows, null, 1))
  } else {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('.env 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (또는 --dry-run)')
    const sb = createClient(url, key, { auth: { persistSession: false } })
    for (let k = 0; k < rows.length; k += BATCH) {
      const chunk = rows.slice(k, k + BATCH)
      const { error } = await sb.from('songs').upsert(chunk, { onConflict: 'source_file' })
      if (error) throw new Error(`upsert 실패 (batch ${k / BATCH}): ${error.message}`)
      process.stdout.write(`\rupsert ${Math.min(k + BATCH, rows.length)}/${rows.length}`)
    }
    process.stdout.write('\n')
  }

  const list = (xs: string[]) => (xs.length ? xs.map((x) => `    - ${x}`).join('\n') : '    (없음)')
  console.log(`
── 요약 ${dryRun ? '(dry-run → ' + outPath + ')' : '(Supabase upsert)'} ──
  .gcg 파일        : ${files.length}
  처리 성공        : ${rows.length}
  슬라이드 합계    : ${slideTotal} (평균 ${(slideTotal / Math.max(rows.length, 1)).toFixed(1)}/곡)
  줄 / 글자 합계   : ${lineTotal} / ${charTotal}
  빈 묶음(제외)    : ${emptyBlocks}
  헤더 없는 파일   : ${noMagic.length}
${noMagic.length ? list(noMagic) + '\n' : ''}  슬라이드 0개     : ${empty.length}
${list(empty)}
  파싱 실패        : ${failed.length}
${failed.length ? failed.map((f) => `    - ${f.file}: ${f.reason}`).join('\n') : '    (없음)'}`)
}

main().catch((e) => { console.error('✖', (e as Error).message); process.exit(1) })
