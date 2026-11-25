// 선곡 기록 E2E(로컬 송출 — 이 PC IndexedDB, 서버 안 씀). Lorem 더미.
// 지난 날짜 선곡 자동 기록 · 지금 선곡 기록 · 같은 선곡 건너뜀 · 송출 종료 뒤에도 기록 유지 · 복사해서 시작(BLANK) · 새로고침·오프라인 유지 · 이름 · 삭제 · 폰 전체 화면
import puppeteer from 'puppeteer-core'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }

const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(11, 0, 0, 0)
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`
const seed = () => ({
  version: yesterday.getTime(), origin: 'e2e', itemIndex: 1, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: [
    { key: 'k0', songId: 'd0', title: 'Lorem A', slides: ['Lorem ipsum', 'Dolor sit'] },
    { key: 'k1', songId: 'd1', title: 'Ipsum B', slides: ['Sed do'] },
  ],
})
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL') ?? '{}'))
const rows = (p) => p.$$eval('.hi .list li .t', (es) => es.map((e) => e.textContent?.trim()))
const openHist = async (p) => { await p.click('.setlist .hist'); await p.waitForSelector('.hi'); await until(async () => !(await p.$('.hi .muted:not(.empty)')) || (await p.$$('.hi .list li')).length > 0) }
const closeHist = async (p) => { await p.keyboard.press('Escape'); await until(async () => !(await p.$('.hi'))) }

const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage()
  p.on('dialog', (d) => d.type() === 'prompt' ? d.accept('Lorem 바꾼 이름') : d.accept())
  await p.setViewport({ width: 1400, height: 900 })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await sleep(3800) // 자동 기록은 열고 3초 뒤

  await openHist(p)
  let r = await rows(p)
  check('어제 선곡이 남아 있으면 열 때 자동 기록("어제날짜 예배")', r.length === 1 && r[0] === `${md(yesterday)} 예배`, JSON.stringify(r))
  check('목록: 곡 수 표시', (await p.$eval('.hi .list li .d', (e) => e.textContent)).includes('2곡'))

  await p.$eval('.hi .save input', (e) => { e.value = '' })
  await p.type('.hi .save input', 'Lorem 주일')
  await p.click('.hi .save button')
  check('지금 선곡 기록 — 같은 선곡이면 건너뜀(가장 최근과 같음)', await until(async () => (await p.$eval('.hi .msg', (e) => e.textContent)).includes('같은 선곡')), await p.$eval('.hi .msg', (e) => e.textContent).catch(() => ''))
  await closeHist(p)

  // 선곡을 바꾸고 기록
  await p.$$eval('.setlist .items li .x', (bs) => bs.at(-1).click()) // Ipsum B 빼기
  await until(async () => (await state(p)).setlist?.length === 1)
  await openHist(p)
  await p.$eval('.hi .save input', (e) => { e.value = '' })
  await p.type('.hi .save input', 'Lorem 주일')
  await p.click('.hi .save button')
  check('바뀐 선곡 기록 → 목록 맨 위', await until(async () => (await rows(p))[0] === 'Lorem 주일'), JSON.stringify(await rows(p)))
  await closeHist(p)

  // 송출 종료 → 선곡 비움, 기록은 남음
  await p.click('.endlocal')
  check('송출 종료 → 선곡 비움', await until(async () => (await state(p)).setlist?.length === 0))
  await openHist(p)
  check('송출 종료 뒤에도 기록 2개 유지(같은 선곡이라 새로 안 생김)', (await rows(p)).length === 2, JSON.stringify(await rows(p)))

  // 복사해서 시작: 어제 기록(2곡) → 선곡 복원, BLANK
  await p.$$eval('.hi .list li', (lis, t) => lis.find((li) => li.querySelector('.t')?.textContent?.trim() === t)?.querySelector('.acts .primary')?.click(), `${md(yesterday)} 예배`)
  check('복사해서 시작 → 창 닫힘, 선곡 2곡 복원', await until(async () => !(await p.$('.hi')) && (await state(p)).setlist?.length === 2))
  const s = await state(p)
  check('복사해서 시작 → 송출 대기(빈 화면, BLANK 아님), 항목 key 는 새로', s.itemIndex === 0 && s.slideIndex === -1 && s.blank === false && s.setlist.every((x) => x.key !== 'k0' && x.key !== 'k1'), JSON.stringify({ i: s.itemIndex, j: s.slideIndex, b: s.blank }))

  // 새로고침·오프라인에도 유지(IndexedDB)
  await p.setOfflineMode(true)
  await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await p.setOfflineMode(false)
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.setOfflineMode(true)
  await openHist(p)
  check('새로고침·인터넷 끊김에도 기록 유지', (await rows(p)).length >= 2, JSON.stringify(await rows(p)))
  await p.setOfflineMode(false)

  // 이름 바꾸기 · 삭제
  await p.$$eval('.hi .list li', (lis) => [...lis[0].querySelectorAll('.acts button')].find((x) => x.textContent?.trim() === '이름')?.click())
  check('이름 바꾸기', await until(async () => (await rows(p)).includes('Lorem 바꾼 이름')), JSON.stringify(await rows(p)))
  const before = (await rows(p)).length
  await p.$$eval('.hi .list li', (lis) => lis[0].querySelector('.acts .danger-line')?.click())
  check('삭제', await until(async () => (await rows(p)).length === before - 1))
  await p.screenshot({ path: OUT + '/history-pc.png' })
  await closeHist(p)

  // 폰: 전체 화면
  const m = await ctx.newPage()
  await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  await m.setViewport({ width: 390, height: 760, isMobile: true, hasTouch: true })
  await m.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await m.$$eval('.dock button', (bs) => bs.find((x) => x.textContent?.includes('선곡'))?.click())
  await sleep(500)
  await m.$eval('.setlist .hist', (x) => x.click())
  await m.waitForSelector('.hi')
  const box = await m.$eval('.hi', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, ow: document.documentElement.scrollWidth > innerWidth } })
  check('폰: 기록 창 전체 화면, 가로 넘침 없음', box.w === 390 && box.h === 760 && !box.ow, JSON.stringify(box))
  await m.screenshot({ path: OUT + '/history-phone.png' })
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
