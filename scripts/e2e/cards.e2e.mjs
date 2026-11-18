// 슬라이드 카드 글자 E2E: 원래 줄바꿈 그대로(브라우저가 임의로 꺾지 않음) + 넘치면 글자 크기만 줄임(v-fit-lines).
// PC(16:9 카드)·폰 280px(한 줄 목록). Lorem 더미, 서버 불필요.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LONG = 'Lorem ipsum dolor sit amet consectetur elit'      // 실제 긴 가사 줄 정도
const HUGE = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt' // 극단적으로 긴 줄
const slides = [
  'Lorem ipsum\nSed do eiusmod',                                      // 짧음 → 그대로
  `${LONG}\nShort line\n${LONG} tempor`,                               // 긴 줄 → 줄여서 3줄 유지
  Array.from({ length: 12 }, (_, i) => `Lorem line ${i + 1}`).join('\n'), // 줄이 많음(높이)
  `${HUGE}\nShort`,                                                     // 최소 크기로도 넘침 → 잘림 표시
]
const seed = () => ({ version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 1, blank: false, frozen: null, style: {}, setlist: [{ key: 'k', songId: 'd', title: 'Lorem', slides }] })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  for (const [label, w, h] of [['PC', 1600, 900], ['폰 280px', 280, 653]]) {
    const p = await (await browser.createBrowserContext()).newPage()
    await p.setViewport({ width: w, height: h })
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
    await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
    await sleep(800)
    const info = await p.$$eval('.card', (cards) => cards.map((c) => {
      const t = c.querySelector('.txt'), idx = c.querySelector('.idx')
      const lh = parseFloat(getComputedStyle(t).lineHeight)
      const range = document.createRange(); range.selectNodeContents(t)
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
      const tr = t.getBoundingClientRect(), ir = idx.getBoundingClientRect()
      return {
        lines, title: t.title, fs: parseFloat(getComputedStyle(t).fontSize), clip: t.classList.contains('fit-clip'),
        overflowX: t.scrollWidth > t.clientWidth + 1, lh,
        idxOverlap: getComputedStyle(idx).position === 'absolute' && ir.bottom > tr.top + 1 && tr.height > 0 && [...range.getClientRects()].some((r) => r.top < ir.bottom && r.left < ir.right),
      }
    }))
    await p.screenshot({ path: path.join(OUT, `cards-${w}.png`) })
    check(`${label}: 짧은 슬라이드 — 2줄, 글자 크기 그대로`, info[0].lines === 2 && !info[0].clip, JSON.stringify(info[0]))
    check(`${label}: 긴 줄 슬라이드 — 원래 3줄 유지(꺾이지 않음), 글자만 작아짐, 가로로 안 넘침`, info[1].lines === 3 && info[1].fs < info[0].fs && !info[1].overflowX, JSON.stringify(info[1]))
    check(`${label}: 카드 번호와 글자가 겹치지 않음`, info.every((x) => !x.idxOverlap), JSON.stringify(info.map((x) => x.idxOverlap)))
    if (label === 'PC') check('PC: 줄 많은 슬라이드 — 줄이거나(최소 크기 넘으면) 잘림 표시', info[2].fs < info[0].fs || info[2].clip, JSON.stringify(info[2]))
    else check('폰: 줄 많은 슬라이드 — 12줄 그대로(높이가 늘어남)', info[2].lines === 12, JSON.stringify(info[2]))
    check(`${label}: 극단적으로 긴 줄 — 2줄 유지, 최소 크기 + 잘림 표시 + 마우스 올리면 전체(title)`, info[3].lines === 2 && info[3].clip && info[3].title.startsWith('Lorem ipsum dolor sit amet consectetur adipiscing'), JSON.stringify({ ...info[3], title: info[3].title.slice(0, 20) }))
  }
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await browser.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
