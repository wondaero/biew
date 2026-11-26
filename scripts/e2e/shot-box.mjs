// 곡 박스·송출 카드 모양 스크린샷(2026-11-26 — 박스 = 은은한 빛, 카드 = 테두리). 로컬 송출, Lorem 더미. 결과: out/e2e/box-*.png
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const many = (n, t) => Array.from({ length: n }, (_, j) => `Lorem ipsum ${t} ${j}\nSed do eiusmod tempor\nUt enim ad minim\nDuis aute irure`)
const seed = (extra = {}) => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 2, blank: false, frozen: null, style: {},
  setlist: ['Lorem A', 'Ipsum B 아주 긴 곡 제목이 들어가면 어떻게 보이는지', 'Dolor C'].map((t, i) => ({ key: 'k' + i, songId: 'd' + i, title: t, slides: many(6, t) })),
  ...extra,
})
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  for (const [name, w, h, mobile] of [['pc', 1400, 900, false], ['phone', 390, 844, true]]) {
    const p = await (await b.createBrowserContext()).newPage()
    await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile })
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
    await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
    await p.waitForSelector('.cell .card')
    await p.$eval('.grid-wrap', (g) => { g.scrollTop = 0 })
    await sleep(300)
    await p.screenshot({ path: path.join(OUT, `box-${name}.png`) })
    // 송출 중인 곡을 스크롤해 제목 줄이 위에 붙은 상태
    await p.$eval('.grid-wrap', (g, m) => { g.scrollTop = m ? 260 : 140 }, mobile)
    await sleep(300)
    await p.screenshot({ path: path.join(OUT, `box-${name}-stuck.png`) })
    // BLANK(노랑) · FREEZE(하늘) 박스 바탕
    await p.$eval('.grid-wrap', (g) => { g.scrollTop = 0 })
    await p.keyboard.press('b'); await sleep(300)
    await p.screenshot({ path: path.join(OUT, `box-${name}-blank.png`) })
    await p.keyboard.press('b'); await p.keyboard.press('f'); await sleep(300)
    await p.screenshot({ path: path.join(OUT, `box-${name}-freeze.png`) })
  }
} finally {
  await b.close()
  await server.stop()
}
