// 뒤로가기 = 팝업 닫기 E2E(모바일 요청): 바텀시트·곡 편집기(겹침)·저장 안 한 변경 확인·버튼으로 닫은 뒤의 뒤로가기·PC 단축키 도움말
// 서버·계정 불필요(로컬 송출, Lorem 콘티).
import puppeteer from 'puppeteer-core'
import { CHROME, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(100) } return false }
const seed = () => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: ['Lorem A', 'Ipsum B'].map((t, i) => ({ key: 'k' + i, songId: 'dummy-' + i, title: t, slides: ['Lorem ipsum', 'Sed do'] })),
})
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const open = async (w, h) => {
    const p = await (await browser.createBrowserContext()).newPage()
    await p.setViewport({ width: w, height: h })
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
    await p.click('section.card.local button.primary') // 홈 → 로컬 송출(앱 안 이동: 히스토리 '/' → '/local')
    await p.waitForSelector('.control')
    await sleep(300)
    return p
  }
  const back = (p) => p.evaluate(() => history.back())
  const path = (p) => p.evaluate(() => location.pathname)

  // ── 폰: 바텀시트 ──
  const m = await open(390, 844)
  let dialog = null
  m.on('dialog', (d) => { dialog = d })
  const sheetOpen = () => m.$('.left.open')
  await m.$$eval('.dock button', (bs) => bs[1].click()) // 콘티
  check('폰: 콘티 시트 열림', await until(sheetOpen))
  await back(m)
  check('뒤로가기 → 시트만 닫힘(페이지 그대로)', await until(async () => !(await sheetOpen())) && (await path(m)) === '/local' && !!(await m.$('.control')))

  // 버튼(✕)으로 닫은 뒤 뒤로가기 → 이번엔 페이지 이동(쌓아 둔 칸이 치워졌는지)
  await m.$$eval('.dock button', (bs) => bs[1].click())
  await until(sheetOpen)
  await m.$$eval('.left .sheet-head button', (bs) => bs.find((b) => b.getAttribute('aria-label') === '닫기')?.click())
  check('✕ 로 닫힘', await until(async () => !(await sheetOpen())))
  await sleep(300)
  check('✕ 로 닫은 뒤 경로 그대로(/local)', (await path(m)) === '/local')

  // 겹친 팝업: 곡 검색 시트 → 새 곡 편집기 → 뒤로가기 2번
  await m.$$eval('.dock button', (bs) => bs[0].click()) // 곡 검색
  await until(sheetOpen)
  await m.$$eval('button.new', (bs) => bs[0].click())
  check('곡 편집기 열림(시트 위)', await until(() => m.$('.dialog')))
  await back(m)
  check('뒤로가기 1번 → 편집기만 닫힘, 시트는 열림', await until(async () => !(await m.$('.dialog'))) && !!(await sheetOpen()))
  await back(m)
  check('뒤로가기 2번 → 시트도 닫힘, 페이지 그대로', await until(async () => !(await sheetOpen())) && (await path(m)) === '/local')

  // 저장 안 한 변경: 뒤로가기 → 확인창 취소 → 그대로 → 다시 뒤로가기 → 확인 → 닫힘
  await m.$$eval('.dock button', (bs) => bs[0].click())
  await until(sheetOpen)
  await m.$$eval('button.new', (bs) => bs[0].click())
  await until(() => m.$('.dialog'))
  await m.type('.dialog input', 'Lorem draft')
  dialog = null
  await back(m)
  check('변경 있음 + 뒤로가기 → "닫을까요?" 확인창', await until(() => dialog !== null))
  await dialog.dismiss()
  await sleep(400)
  check('취소 → 편집기 그대로 열림', !!(await m.$('.dialog')) && (await path(m)) === '/local')
  dialog = null
  await back(m)
  check('다시 뒤로가기 → 또 확인창(칸이 다시 쌓였음)', await until(() => dialog !== null))
  await dialog.accept()
  check('확인 → 편집기 닫힘, 페이지 그대로', await until(async () => !(await m.$('.dialog'))) && (await path(m)) === '/local')
  await back(m) // 시트 닫기
  await until(async () => !(await sheetOpen()))

  // 팝업이 없을 때 뒤로가기 → 정상적으로 이전 페이지(홈)
  await back(m)
  check('팝업 없을 때 뒤로가기 → 이전 페이지(홈)', await until(async () => (await path(m)) === '/'))

  // ── 폰: 출력 설정 시트의 고정 미리보기(설정을 바꾸며 결과를 바로 봄) ──
  await m.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await m.$$eval('.dock button', (bs) => bs[2].click()) // 출력 설정
  check('출력 설정 시트에 미리보기', !!(await m.waitForSelector('.style-sheet.open .sheet-pv .pv-screen', { timeout: 5000 }).catch(() => null)))
  const pvTop = () => m.$eval('.sheet-pv', (e) => e.getBoundingClientRect().top)
  await sleep(500) // 시트가 올라오는 애니메이션(0.2초)이 끝난 뒤 위치를 잰다
  const top0 = await pvTop()
  await m.$eval('.style-sheet', (e) => { e.scrollTop = 600 })
  await sleep(200)
  check('설정을 아래로 스크롤해도 미리보기 위치 고정', Math.abs((await pvTop()) - top0) < 1)
  const fs0 = await m.$eval('.sheet-pv .txt', (e) => parseFloat(getComputedStyle(e).fontSize))
  await m.$eval('.style-sheet input[type=range]', (e) => { e.value = '12'; e.dispatchEvent(new Event('input', { bubbles: true })) })
  check('크기 바꾸면 미리보기에 바로 반영', await until(async () => (await m.$eval('.sheet-pv .txt', (e) => parseFloat(getComputedStyle(e).fontSize))) > fs0 * 1.3))
  // 수정본: 송출(저장된 송출 상태)은 그대로, 적용을 눌러야 나간다
  const airFont = () => m.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL') ?? '{}').style?.fontSize)
  const before = await airFont()
  check('적용 전: 송출 설정은 그대로', before !== 12, String(before))
  await back(m)
  check('뒤로가기 → 출력 설정 시트 닫힘', await until(async () => !(await m.$('.style-sheet.open'))))
  check('닫아도 수정본 유지 → 하단 "출력 설정"에 표시(•)', !!(await m.$('.dock button.dirty .dock-dot')))
  await m.$$eval('.dock button', (bs) => bs[2].click())
  await m.waitForSelector('.style-sheet.open .sheet-pv .apply', { timeout: 3000 })
  await sleep(400)
  await m.click('.style-sheet.open .sheet-pv .apply')
  check('시트의 [적용] → 송출 설정 바뀜, 표시 사라짐', await until(async () => (await airFont()) === 12) && !(await m.$('.dock button.dirty')))
  await back(m)
  await until(async () => !(await m.$('.style-sheet.open')))

  // ── PC: 단축키 도움말 ──
  const d = await open(1400, 900)
  await d.click('button.desk-only.quiet')
  check('PC: 단축키 도움말 열림', await until(() => d.$('.help')))
  await back(d)
  check('PC: 뒤로가기 → 도움말만 닫힘', await until(async () => !(await d.$('.help'))) && (await path(d)) === '/local')
  // PC: 오른쪽 패널을 스크롤해도 송출 모니터는 위에 고정
  const monTop = () => d.$eval('aside.right .monitors', (e) => e.getBoundingClientRect().top)
  const mt0 = await monTop()
  await d.$eval('aside.right', (e) => { e.scrollTop = 600 })
  await sleep(200)
  check('PC: 출력 설정을 스크롤해도 송출 모니터 고정', Math.abs((await monTop()) - mt0) < 12 && (await d.$eval('aside.right', (e) => e.scrollTop)) > 100)
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await browser.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
