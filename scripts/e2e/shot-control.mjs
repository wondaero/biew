// 컨트롤러 화면 스크린샷(디자인 비교용, 검사 아님): node scripts/e2e/shot-control.mjs <이름>
//  → out/e2e/<이름>-desk.png(즉시 모드) · -desk-pvw.png(미리보기 후 송출 + BLANK + FREEZE) · -mobile.png
// Lorem 선곡을 로컬 송출(localStorage biew.live.v1:LOCAL)에 심어 찍는다. 서버·계정 불필요.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'

const name = process.argv[2] ?? 'control'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lorem = (t) => ['Lorem ipsum dolor sit amet\nconsectetur adipiscing', 'Sed do eiusmod tempor\nincididunt ut labore', 'Ut enim ad minim veniam\nquis nostrud', 'Duis aute irure dolor\nin reprehenderit'].map((s) => `${s}\n${t}`)
const seed = () => ({
  version: Date.now(), origin: 'shot', itemIndex: 0, slideIndex: 1, blank: false, frozen: null, style: {},
  setlist: ['Lorem A', 'Ipsum B', 'Dolor C'].map((t, i) => ({ key: 'k' + i, songId: 'dummy-' + i, title: t, slides: lorem(t) })),
})
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const open = async (w, h) => {
    const p = await (await browser.createBrowserContext()).newPage()
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    p.on('dialog', (d) => d.dismiss())
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
    await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
    await p.waitForSelector('.control')
    await sleep(600)
    return p
  }
  const shot = (p, suffix) => p.screenshot({ path: path.join(OUT, `${name}-${suffix}.png`) })

  const d = await open(1600, 900)
  await shot(d, 'desk')
  await d.click('label.mode input') // 미리보기 후 송출
  await d.evaluate(() => document.activeElement?.blur?.()) // 체크박스 포커스면 단축키가 안 먹음
  await d.keyboard.press('b') // BLANK
  await d.keyboard.press('f') // FREEZE
  await sleep(400)
  await shot(d, 'desk-pvw')

  const m = await open(390, 844)
  await shot(m, 'mobile')
  console.log(`✔ ${OUT}${path.sep}${name}-{desk,desk-pvw,mobile}.png`)
} finally {
  await browser.close()
  await server.stop()
}
