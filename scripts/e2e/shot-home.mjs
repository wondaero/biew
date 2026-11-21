// 홈 화면 스크린샷(확인용): PC 빈 상태 · PC 채널 있음(Lorem 기록을 이 기기에 심음) · 폰 390/280(가로 넘침 출력) · 좁은 PC 창. out/e2e/home-*.png
import puppeteer from 'puppeteer-core'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await p.screenshot({ path: OUT + '/home-desk-empty.png' })
  await p.evaluate(() => {
    const now = Date.now()
    const iso = (min) => new Date(now - min * 60000).toISOString()
    localStorage.setItem('biew.host.482913', JSON.stringify({ title: 'Lorem 주일 2부', token: 'x', controlTopic: null, viewTopic: null, openedAt: iso(20) }))
    localStorage.setItem('biew.host.771042', JSON.stringify({ title: 'Ipsum 새벽기도', token: null, controlTopic: null, viewTopic: null, openedAt: iso(60 * 30) }))
    localStorage.setItem('biew.visit.control.105377', JSON.stringify({ title: 'Dolor 청년부 예배', at: iso(60 * 5) }))
    localStorage.setItem('biew.visit.view.105377', JSON.stringify({ title: 'Dolor 청년부 예배', at: iso(60 * 6) }))
    localStorage.setItem('biew.visit.view.930214', JSON.stringify({ title: 'Sit amet 수요예배 아주 긴 제목이 들어가면 어떻게 보이는지', at: iso(60 * 50) }))
    localStorage.setItem('biew.visit.view.ABC234', JSON.stringify({ title: 'Consectetur 옛 채널', at: iso(60 * 80) }))
  })
  await p.reload({ waitUntil: 'networkidle0' })
  await p.screenshot({ path: OUT + '/home-desk.png' })
  await p.$$eval('button', (bs) => bs.find((x) => x.textContent?.trim() === '번호로 입장')?.click())
  await new Promise((r) => setTimeout(r, 300))
  await p.screenshot({ path: OUT + '/home-desk-join.png' })
  // 폰(아이폰 UA): 같은 기록이 보이게 위 PC 탭과 같은 브라우저 컨텍스트(localStorage 공유)
  for (const w of [390, 280]) {
    const m = await ctx.newPage()
    await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    await m.setViewport({ width: w, height: 844, isMobile: true, hasTouch: true })
    await m.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await m.screenshot({ path: OUT + `/home-phone-${w}.png`, fullPage: true })
    console.log(w, 'overflowX', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  }
  const n = await ctx.newPage()
  await n.setViewport({ width: 900, height: 900 })
  await n.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await n.screenshot({ path: OUT + '/home-narrow-pc.png' })
} finally { await b.close(); await server.stop() }
