// 자동 포커스 E2E(2026-11-21 피드백): 폰에서 곡 목록 열기·[+ 선곡]·새 곡 편집기가 입력칸에 포커스를 주지 않음(키패드 안 뜸).
// PC 는 그대로(검색칸 포커스 → 바로 다음 곡). 로컬 송출, Lorem 곡(IndexedDB). 서버·계정 안 씀.
import puppeteer from 'puppeteer-core'
import { CHROME, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')))
const focused = (p) => p.evaluate(() => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') ? a.className || a.tagName : null })

async function open(p, w, h, mobile) {
  if (mobile) { await p.setUserAgent(IPHONE); await p.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 })) }
  await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async () => {
    localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify({ version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {}, setlist: [] }))
    await new Promise((res, rej) => {
      const r = indexedDB.open('biew', 3)
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('songs', { keyPath: 'id' }); d.createObjectStore('meta'); d.createObjectStore('pending', { keyPath: 'id' }); d.createObjectStore('media', { keyPath: 'id' }) }
      r.onsuccess = () => { const t = r.result.transaction('songs', 'readwrite'); const now = new Date().toISOString(); ['Lorem alpha', 'Ipsum beta'].forEach((x, i) => t.objectStore('songs').put({ id: 'lib-' + i, title: x, slides: ['Lorem ipsum', 'Sed do'], source_file: null, updated_at: now, deleted_at: null })); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej }
      r.onerror = rej
    })
  })
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
}
const openList = async (p, mobile) => {
  if (mobile) await p.$$eval('nav.dock button', (bs) => bs.find((b) => b.textContent?.includes('곡 목록'))?.click())
  else await p.click('.side-actions .find')
  await p.waitForSelector('.srch input.search', { timeout: 8000 })
  await sleep(300)
}
/** 검색어 넣기 — 포커스를 건드리지 않고(사람이 타자 친 뒤 키패드를 내린 상태와 같음) */
const fill = async (p, v) => {
  await p.$eval('.srch input.search', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); if (document.activeElement === e) e.blur() }, v)
  await p.waitForSelector('.srch ol.hits li .add', { timeout: 8000 })
}

const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  // ── 폰 ──
  const m = await (await b.createBrowserContext()).newPage()
  await open(m, 390, 844, true)
  await openList(m, true)
  check('폰: 곡 목록 열어도 검색칸 포커스 없음', (await focused(m)) === null, await focused(m))
  await fill(m, 'Lorem')
  await m.$eval('.srch ol.hits li .add', (e) => e.click())
  await sleep(300)
  check('폰: [+ 선곡] → 선곡에 추가됨', (await state(m)).setlist.length === 1)
  check('폰: [+ 선곡] 뒤에도 입력칸 포커스 없음(키패드 안 뜸)', (await focused(m)) === null, await focused(m))
  check('폰: 버튼 이름 "+ 선곡"', (await m.$eval('.srch ol.hits li .add', (e) => e.textContent?.trim())) === '+ 선곡')

  // ── PC: 그대로 ──
  const p = await (await b.createBrowserContext()).newPage()
  await open(p, 1400, 900, false)
  await openList(p, false)
  check('PC: 곡 목록 열면 검색칸 포커스(바로 입력)', (await focused(p))?.includes('search'), await focused(p))
  await p.type('.srch input.search', 'Lorem')
  await p.waitForSelector('.srch ol.hits li .add', { timeout: 8000 })
  await p.click('.srch ol.hits li .add')
  await sleep(300)
  check('PC: [+ 선곡] 뒤 검색칸으로 돌아감(다음 곡 바로 검색)', (await focused(p))?.includes('search'), await focused(p))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
