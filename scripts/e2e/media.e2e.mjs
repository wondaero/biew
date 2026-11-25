// 그림 슬라이드(PDF·이미지) E2E — 로컬 송출. 서버·계정 안 씀. 더미 = 색 칠한 PDF·PNG(글 없음).
// PDF → 장마다 그림 · 순서 · 카드 그림·✎ 없음 · 송출/출력 창 · FREEZE · 그림 이름 자연 정렬 · PPT 안내 · 새로고침 유지 · 폰 280px.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(200) } return false }

// ── 더미 파일 ──
const DIR = path.join(OUT, 'media-fixture')
mkdirSync(DIR, { recursive: true })
/** 장마다 한 가지 색으로 칠한 16:9 PDF(빨강·초록·파랑) */
function makePdf(file, colors) {
  const objs = []
  const n = colors.length
  const kids = colors.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`)
  colors.forEach((c, i) => {
    const s = `${c} rg 0 0 960 540 re f 1 1 1 rg 40 40 200 100 re f`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents ${4 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  writeFileSync(file, out, 'latin1')
}
const PDF = path.join(DIR, 'Lorem deck.pdf')
makePdf(PDF, ['1 0 0', '0 1 0', '0 0 1'])
const PPT = path.join(DIR, 'Lorem.pptx')
writeFileSync(PPT, 'not a real pptx')

const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')))
/** 그림 요소의 가운데 픽셀 색(r,g,b) — 그림이 실제로 그려졌는지·순서 확인 */
const centerColor = (p, sel) => p.$eval(sel, (img) => {
  if (!img.complete || !img.naturalWidth) return null
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const d = g.getImageData(c.width * 0.7 | 0, c.height * 0.6 | 0, 1, 1).data
  return [d[0], d[1], d[2]].map((v) => (v > 128 ? 1 : 0)).join('')
}).catch(() => null)
async function pick(p, file) {
  const [chooser] = await Promise.all([p.waitForFileChooser(), p.click('.side-actions .mi-open')])
  await chooser.accept(Array.isArray(file) ? file : [file])
}

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport({ width: 1400, height: 900 })
  p.on('dialog', (d) => d.accept())
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.evaluate(() => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify({
    version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
    setlist: [{ key: 'k0', songId: 'nowhere', title: 'Lorem A', slides: ['Lorem ipsum', 'Dolor sit'] }],
  })))
  await p.reload({ waitUntil: 'networkidle0' })

  // PPT → 안내
  await pick(p, PPT)
  check('PPT 파일 → "PDF 로 저장" 안내, 선곡 그대로', await until(async () => ((await p.$eval('.mi-notice', (e) => e.textContent).catch(() => '')) ?? '').includes('PDF')) && (await state(p)).setlist.length === 1)

  // PDF 3장
  const t0 = Date.now()
  await pick(p, PDF)
  check('PDF → 선곡에 그림 묶음 추가(3장)', await until(async () => (await state(p)).setlist.length === 2), JSON.stringify((await state(p)).setlist.map((x) => x.slides.length)))
  const s = await state(p)
  const item = s.setlist[1]
  console.log(`    (변환 ${Date.now() - t0}ms)`)
  check('제목 = 파일 이름, 장 = 그림 표시 3개', item.title === 'Lorem deck' && item.slides.length === 3 && item.slides.every((x) => x.startsWith('biew-media:')) && new Set(item.slides).size === 3)
  check('추가 알림', ((await p.$eval('.mi-notice', (e) => e.textContent).catch(() => '')) ?? '').includes('그림 3장'))
  check('선곡 목록에 🖼 표시', !!(await p.$('.setlist .pic')))
  check('카드 3장 모두 그림', await until(async () => (await p.$$eval('[data-item="1"] .card .thumb img', (is) => is.filter((i) => i.complete && i.naturalWidth > 0).length)) === 3))
  const order = []
  for (let j = 1; j <= 3; j++) order.push(await centerColor(p, `[data-item="1"] .cell:nth-child(${j}) img`))
  check('장 순서 = PDF 순서(빨·초·파)', order.join(',') === '100,010,001', order.join(','))
  // ⋯ 메뉴(2026-11-25): 그림 장은 [복사]만(편집 없음 — 그림은 PowerPoint 에서 고쳐 다시 넣기), 가사 장은 [편집][복사]
  await p.$eval('[data-item="1"] .cell .more', (b) => b.click()); await p.waitForSelector('.more-menu')
  const picMenu = { edit: !!(await p.$('.more-menu .m-edit')), copy: !!(await p.$('.more-menu .m-copy')) }
  await p.click('.more-backdrop'); await sleep(200)
  await p.$eval('[data-item="0"] .cell .more', (b) => b.click()); await p.waitForSelector('.more-menu')
  const txtMenu = { edit: !!(await p.$('.more-menu .m-edit')) }
  await p.click('.more-backdrop'); await sleep(200)
  check('그림 장 ⋯ 메뉴엔 [복사]만(편집 없음), 가사 장엔 [편집]', !picMenu.edit && picMenu.copy && txtMenu.edit, JSON.stringify({ picMenu, txtMenu }))

  // 출력 창
  const out = await ctx.newPage()
  await out.setViewport({ width: 960, height: 540 })
  await out.goto(BASE + '/output/LOCAL', { waitUntil: 'domcontentloaded' })
  await p.bringToFront()
  await p.click('[data-item="1"] .cell:nth-child(2) .card')
  check('카드 클릭 → 송출(2장)', await until(async () => { const x = await state(p); return x.itemIndex === 1 && x.slideIndex === 1 }))
  check('PGM 모니터에 그림(초록)', await until(async () => (await centerColor(p, '.side .screen.jump img')) === '010'))
  await out.bringToFront()
  check('출력 창에 그림(초록)', await until(async () => (await centerColor(out, '.media img')) === '010'))
  await out.screenshot({ path: path.join(OUT, 'media-output.png') })
  await p.bringToFront()

  // FREEZE → 다음 장으로 가도 출력은 그대로
  await p.keyboard.press('f'); await sleep(200)
  await p.keyboard.press('ArrowRight'); await sleep(400)
  await out.bringToFront()
  check('FREEZE 중 → 출력은 고정(초록)', (await state(p)).slideIndex === 2 && (await until(async () => (await centerColor(out, '.media img')) === '010', 3000)))
  await p.bringToFront()
  await p.click('.freeze')
  await out.bringToFront()
  check('FREEZE 풀면 → 3장(파랑)', await until(async () => (await centerColor(out, '.media img')) === '001'))
  await p.bringToFront()
  await p.keyboard.press('b')
  await out.bringToFront()
  check('BLANK → 출력에서 그림 사라짐', await until(async () => !(await out.$('.media img'))))
  await p.bringToFront()
  await p.keyboard.press('b')

  // 그림 여러 장(이름 순서) — 크기를 다르게 해 순서 확인
  const names = ['Ipsum 10.png', 'Ipsum 2.png', 'Ipsum 1.png']
  const sizes = { 'Ipsum 1.png': 100, 'Ipsum 2.png': 200, 'Ipsum 10.png': 300 }
  for (const n of names) {
    const b64 = await p.evaluate((w) => { const c = document.createElement('canvas'); c.width = w; c.height = w / 2; const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, w, w / 2); return c.toDataURL('image/png').split(',')[1] }, sizes[n])
    writeFileSync(path.join(DIR, n), Buffer.from(b64, 'base64'))
  }
  await pick(p, names.map((n) => path.join(DIR, n)))
  check('그림 3장 → 선곡 추가', await until(async () => (await state(p)).setlist.length === 3))
  const imgItem = (await state(p)).setlist[2]
  const widths = await p.evaluate((ids) => new Promise((res) => {
    const r = indexedDB.open('biew'); r.onsuccess = () => { const st = r.result.transaction('media').objectStore('media'); Promise.all(ids.map((id) => new Promise((ok) => { const g = st.get(id); g.onsuccess = () => ok(g.result?.w) }))).then(res) }
  }), imgItem.slides.map((x) => x.slice('biew-media:'.length)))
  check('그림 순서 = 이름 자연 정렬(1, 2, 10)', widths.join(',') === '100,200,300', widths.join(','))
  check('제목 = 공통 이름 + 장 수', imgItem.title === 'Ipsum (3장)', imgItem.title)

  // 같은 PDF 다시 → 그림은 늘지 않음(내용 해시)
  const count = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('biew'); r.onsuccess = () => { const g = r.result.transaction('media').objectStore('media').count(); g.onsuccess = () => res(g.result) } }))
  const c1 = await count()
  await pick(p, PDF)
  await until(async () => (await state(p)).setlist.length === 4)
  check('같은 PDF 다시 넣어도 저장된 그림 수 그대로', (await count()) === c1, `${c1} → ${await count()}`)

  // 새로고침해도 그림 유지
  await p.reload({ waitUntil: 'networkidle0' })
  check('새로고침 후에도 카드 그림', await until(async () => (await p.$$eval('[data-item="1"] .card .thumb img', (is) => is.filter((i) => i.complete && i.naturalWidth > 0).length)) === 3))
  await p.screenshot({ path: path.join(OUT, 'media-pc.png') })

  // 다른 기기(그림 없음) = 자리 표시 — 다른 브라우저 프로필에서 같은 상태
  const other = await (await browser.createBrowserContext()).newPage()
  await other.setViewport({ width: 1400, height: 900 })
  await other.goto(BASE + '/local', { waitUntil: 'domcontentloaded' })
  await other.evaluate((st) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(st)), await state(p))
  await other.reload({ waitUntil: 'networkidle0' })
  check('그림 없는 기기 → 카드에 "🖼 그림" 자리 표시', await until(async () => (await other.$$('[data-item="1"] .card .none')).length === 3))

  // 폰 280px
  const m = await (await browser.createBrowserContext()).newPage()
  await m.setViewport({ width: 280, height: 640, isMobile: true, hasTouch: true })
  await m.goto(BASE + '/local', { waitUntil: 'domcontentloaded' })
  await m.evaluate((st) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(st)), await state(p))
  await m.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check('폰 280px: 가로 넘침 없음', ov <= 0, `${ov}px`)
  check('폰: 선곡 창에 [🖼 그림] 버튼', await m.$eval('.set-wrap .mi-open', (b) => b.textContent.includes('그림')).catch(() => false))
  await m.screenshot({ path: path.join(OUT, 'media-280.png') })
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
