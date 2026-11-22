// 주소 E2E(서버 채널 불필요): 숫자 번호 짧은 주소(/123456 보기, /123456/control 리모컨) · 예전 주소 이동(쿼리 유지) · 영문 번호 예전 주소 유지 · 잘못된 주소 → 홈 · 홈 번호 입력
import puppeteer from 'puppeteer-core'
import { CHROME, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const p = await (await b.createBrowserContext()).newPage()
  // 폰(아이폰 UA): 홈 맨 위에 번호 입력칸이 바로 있다(PC 는 [번호로 입장] 대화창 — 같은 입력칸)
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  const at = () => p.evaluate(() => location.pathname + location.search)
  const go = (u) => p.goto(BASE + u, { waitUntil: 'networkidle0' })
  // 존재하지 않는 숫자 채널(000000 은 생성될 확률 100만분의 1 — 그래도 '보기 화면이 뜨는지'만 본다)
  await go('/000000')
  check('/000000 → 보기 화면(주소 유지)', (await at()) === '/000000' && await until(() => p.$('.viewer, .join, main').then(Boolean)))
  await go('/000000/control')
  check('/000000/control → 컨트롤 게이트(주소 유지)', (await at()) === '/000000/control' && await until(() => p.$eval('body', (b) => (b.textContent ?? '').length > 0)))
  await go('/view/000000?x=1')
  check('예전 /view/000000 → /000000 (쿼리 유지)', await until(async () => (await at()) === '/000000?x=1'), await at())
  await go('/control/000000?share=1')
  check('예전 /control/000000 → /000000/control (쿼리 유지)', await until(async () => (await at()) === '/000000/control?share=1'), await at())
  await go('/view/ABC234')
  check('영문 번호는 예전 주소 그대로', (await at()) === '/view/ABC234')
  await go('/local')
  check('/local 은 로컬 송출 그대로', (await at()) === '/local')
  await go('/abcdef')
  check('잘못된 주소 → 홈', await until(async () => (await at()) === '/'))
  // 홈: 번호 입력(숫자 키패드) → 짧은 주소
  await go('/')
  check('번호 입력칸 = 숫자 키패드', (await p.$eval('input.code', (e) => e.inputMode)) === 'numeric')
  await p.type('input.code', '123 456')
  await p.click('form.join-inline button[type=submit]') // 보기
  check('홈 번호 입력 → /123456', await until(async () => (await at()) === '/123456'), await at())
  await go('/')
  await p.type('input.code', '123456')
  await p.$$eval('form.join-inline button', (bs) => bs.find((x) => x.textContent?.includes('제어'))?.click())
  check('홈 번호 입력 → /123456/control', await until(async () => (await at()) === '/123456/control'), await at())
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
