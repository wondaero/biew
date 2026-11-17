// 배경 E2E(로컬 송출): 예전 'green' 이어받기 · 단색 · 그라데이션(방향·색 바꾸기) · 키잉 경고. Lorem 더미.
import puppeteer from 'puppeteer-core'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179) // 개발 서버가 없으면 띄우고 끝나면 끈다
const BASE = 'http://localhost:5179'
const SHOT = OUT + '/'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const ctx = await b.createBrowserContext()
  const c = await ctx.newPage()
  await c.setViewport({ width: 1400, height: 1000 })
  await c.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  // 예전 형식으로 저장된 콘티(배경 'green')
  await c.evaluate(() => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify({
    version: Date.now(), origin: 'old', itemIndex: 0, slideIndex: 0, blank: false,
    style: { background: 'green' }, setlist: [{ key: 'k', songId: 'd', title: 'Lorem', slides: ['Lorem ipsum dolor\nsit amet'] }],
  })))
  await c.reload({ waitUntil: 'networkidle0' })
  const out = await ctx.newPage()
  await out.setViewport({ width: 960, height: 540 })
  await out.goto(BASE + '/output/LOCAL', { waitUntil: 'domcontentloaded' })
  const outBg = () => out.$eval('.stage', (e) => getComputedStyle(e).backgroundImage + '|' + getComputedStyle(e).backgroundColor)
  check("예전 저장값 'green' → 초록(크로마키) 이어받음", await until(async () => (await outBg()).includes('rgb(0, 177, 64)')))
  await c.bringToFront()
  const warn = () => c.$('.bg .warn')
  check('키잉 색(초록)일 땐 경고 없음', !(await warn()))
  const btn = (t) => c.$$eval('.bg button', (bs, t) => bs.find((x) => x.textContent?.trim() === t)?.click(), t)
  await btn('그라데이션')
  check('그라데이션 → 출력에 linear-gradient(위→아래)', await until(async () => (await outBg()).startsWith('linear-gradient(rgb(30, 58, 95), rgb(0, 0, 0))')), await outBg())
  check('키잉 불가 경고 표시', !!(await warn()))
  await btn('↘')
  check('방향 ↘ → to right bottom', await until(async () => (await outBg()).startsWith('linear-gradient(to right bottom')), await outBg())
  await btn('⇄')
  check('⇄ 색 바꾸기 → 검정에서 남색으로', await until(async () => (await outBg()).includes('rgb(0, 0, 0), rgb(30, 58, 95)')), await outBg())
  await out.screenshot({ path: SHOT + 'bg-gradient.png' })
  await btn('단색')
  check('단색 → 그라데이션 시작 색(검정)으로', await until(async () => (await outBg()).startsWith('none|rgb(0, 0, 0)')), await outBg())
  check('단색 검정은 루마키로 인식(경고 없음)', await until(async () => !(await warn())))
  await btn('초록 (크로마키)')
  check('초록(크로마키) 버튼', await until(async () => (await outBg()).includes('rgb(0, 177, 64)')))
  const saved = await c.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')).style)
  check('저장 형식: backdrop(예전 background 필드 없음)', saved.backdrop?.kind === 'solid' && !('background' in saved), JSON.stringify(saved.backdrop))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
