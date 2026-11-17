// 저장된 출력 설정 E2E(로컬 송출, 서버 없음): 저장 → 바꿈 → 불러오기(출력에 반영) · 적용 중 표시 · 다시 열어도 유지 · 덮어쓰기 · 삭제 · 서버 요청 없음. Lorem 더미.
import puppeteer from 'puppeteer-core'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const ctx = await b.createBrowserContext()
  const c = await ctx.newPage()
  c.on('dialog', (d) => d.accept())
  // 서버(Supabase)로 프리셋이 나가는지 감시
  const leaks = []
  c.on('request', (r) => { if (/supabase\.co/.test(r.url()) && /preset|stylePreset/i.test((r.postData() ?? '') + r.url())) leaks.push(r.url()) })
  await c.setViewport({ width: 1400, height: 1000 })
  await c.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await c.evaluate(() => {
    localStorage.removeItem('biew.stylePresets.v1')
    localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify({
      version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null,
      style: { backdrop: { kind: 'solid', color: '#000000' }, color: '#ffffff' },
      setlist: [{ key: 'k', songId: 'd', title: 'Lorem', slides: ['Lorem ipsum dolor\nsit amet'] }],
    }))
  })
  await c.reload({ waitUntil: 'networkidle0' })
  const out = await ctx.newPage()
  await out.setViewport({ width: 960, height: 540 })
  await out.goto(BASE + '/output/LOCAL', { waitUntil: 'domcontentloaded' })
  const outBg = () => out.$eval('.stage', (e) => getComputedStyle(e).backgroundColor)
  await c.bringToFront()

  const save = async (name) => { await c.$eval('.p-save input', (e) => { e.value = '' }); await c.type('.p-save input', name); await c.click('.p-save button') }
  const names = () => c.$$eval('.p-list .p-name', (es) => es.map((e) => e.textContent?.trim()))
  const activeName = () => c.$eval('.p-list li.on .p-name', (e) => e.textContent?.trim()).catch(() => null)
  const applyBtn = (n) => c.$$eval('.p-list li', (lis, n) => lis.find((l) => l.querySelector('.p-name')?.textContent?.trim() === n)?.querySelector('.p-apply')?.click(), n)
  const delBtn = (n) => c.$$eval('.p-list li', (lis, n) => lis.find((l) => l.querySelector('.p-name')?.textContent?.trim() === n)?.querySelector('.p-del')?.click(), n)
  const bgBtn = (t) => c.$$eval('.bg button', (bs, t) => bs.find((x) => x.textContent?.trim() === t)?.click(), t)

  check('처음엔 저장된 설정 없음', !(await c.$('.p-list')))
  await save('Lorem 검정')
  check('저장 → 목록에 표시 · 적용 중', await until(async () => (await names()).join() === 'Lorem 검정' && (await activeName()) === 'Lorem 검정'))
  await bgBtn('초록 (크로마키)')
  check('설정을 바꾸면 적용 중 표시 사라짐', await until(async () => (await activeName()) === null))
  check('출력 초록', await until(async () => (await outBg()) === 'rgb(0, 177, 64)'))
  await save('Ipsum 초록')
  await applyBtn('Lorem 검정')
  check('불러오기 → 출력이 검정으로', await until(async () => (await outBg()) === 'rgb(0, 0, 0)'), await outBg())
  check('불러온 설정이 적용 중', (await activeName()) === 'Lorem 검정')
  await c.screenshot({ path: OUT + '/presets-panel.png' })

  await c.reload({ waitUntil: 'networkidle0' })
  check('다시 열어도 목록 유지(이 PC)', await until(async () => (await names()).join() === 'Lorem 검정,Ipsum 초록'))
  await bgBtn('초록 (크로마키)')
  await save('lorem 검정') // 같은 이름(대소문자 무시) → 덮어쓰기 확인 → 수락
  check('같은 이름 저장 = 덮어쓰기(개수 그대로)', await until(async () => (await names()).length === 2 && (await activeName()) !== null))
  await delBtn('Ipsum 초록')
  check('삭제', await until(async () => (await names()).length === 1))
  const stored = await c.evaluate(() => JSON.parse(localStorage.getItem('biew.stylePresets.v1') ?? '[]'))
  check('localStorage 에 저장(biew.stylePresets.v1)', stored.length === 1 && stored[0].style?.backdrop?.color === '#00b140', JSON.stringify(stored[0]?.style?.backdrop))
  check('서버로 보낸 요청 없음', leaks.length === 0, leaks.join(' '))
  await c.evaluate(() => localStorage.removeItem('biew.stylePresets.v1'))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
