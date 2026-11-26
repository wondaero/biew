// 곡 목록 아래 줄(2026-11-26): [+ 선곡]은 바로 들어가고, 아래에 "이번에 추가 N곡 [되돌리기] [완료]".
// 되돌리기 = 이 창을 연 동안 넣은 곡만 빼기(전부터 있던 곡은 그대로) · ✕/Esc 로 닫아도 넣은 곡은 남음 · 폰 280px 넘침 없음. Lorem 더미, 서버 안 씀.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }
const seed = () => ({ version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: [{ key: 'k0', songId: 'd0', title: 'Lorem 처음', slides: ['Lorem ipsum'] }] })
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')))
async function open(p, w, h, mobile) {
  await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (s) => {
    localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s))
    await new Promise((res, rej) => {
      const r = indexedDB.open('biew', 4) // 앱 저장소 버전과 같게(낮게 만들면 앱의 업그레이드가 '이미 있음'으로 깨짐)
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('songs', { keyPath: 'id' }); d.createObjectStore('meta'); d.createObjectStore('pending', { keyPath: 'id' }); d.createObjectStore('media', { keyPath: 'id' }); d.createObjectStore('history', { keyPath: 'id' }).createIndex('scope', 'scope') }
      r.onsuccess = () => { const t = r.result.transaction('songs', 'readwrite'); const now = new Date().toISOString(); ['Lorem alpha', 'Ipsum beta', 'Dolor gamma'].forEach((x, i) => t.objectStore('songs').put({ id: 'lib-' + i, title: x, slides: ['Lorem ipsum', 'Sed do'], source_file: null, updated_at: now, deleted_at: null })); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej }
      r.onerror = rej
    })
  }, seed())
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.waitForSelector('.cell .card')
}
const openList = async (p) => { await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('곡 목록'))?.click()); await p.waitForSelector('.srch'); await p.type('.srch input', 'a'); await until(async () => (await p.$$('.srch .add')).length >= 3) }
const foot = (p) => p.$eval('.srch-foot', (e) => e.textContent?.replace(/\s+/g, ' ').trim()).catch(() => '')

const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const p = await (await b.createBrowserContext()).newPage()
  const dialogs = []
  p.on('dialog', (d) => { dialogs.push(d.message()); d.accept() })
  await open(p, 1400, 900, false)
  await openList(p)
  check('처음엔 "이번에 추가한 곡 없음" + [닫기]', (await foot(p)).includes('이번에 추가한 곡 없음') && (await p.$eval('.srch-foot .done', (e) => e.textContent?.trim())) === '닫기' && !(await p.$('.srch-foot .undo-added')))
  await p.$$eval('.srch .add', (bs) => bs[0].click()); await sleep(300)
  await p.$$eval('.srch .add', (bs) => bs[1].click()); await sleep(200)
  check('[+ 선곡] 두 번 → 바로 선곡에(3곡)', (await state(p)).setlist.length === 3)
  const addedTitles = (await state(p)).setlist.slice(1).map((x) => x.title) // 검색 결과 순서와 무관하게
  check('아래 줄 "이번에 추가 2곡" + 곡 이름 + [되돌리기][완료]', await until(async () => { const f = await foot(p); return f.includes('이번에 추가 2곡') && addedTitles.every((t) => f.includes(t)) }) && (await p.$eval('.srch-foot .done', (e) => e.textContent?.trim())) === '완료' && !!(await p.$('.srch-foot .undo-added')), await foot(p))
  await p.click('.srch-foot .undo-added')
  check('[되돌리기] → 확인창(곡 이름) 후 이번에 넣은 것만 빠짐, 전부터 있던 곡은 그대로', await until(async () => { const s = await state(p); return s.setlist.length === 1 && s.setlist[0].key === 'k0' }) && dialogs.some((m) => m.includes('2곡') && addedTitles.every((t) => m.includes(t))))
  check('되돌린 뒤 "이번에 추가한 곡 없음"', (await foot(p)).includes('이번에 추가한 곡 없음'))
  await p.$$eval('.srch .add', (bs) => bs[2].click()); await sleep(200)
  // 넣은 곡이 있는데 ✕ → 묻기(2026-11-26 사용자 요청)
  await p.click('.srch .x')
  check('넣은 곡이 있으면 ✕ → "그대로 두고 닫기/빼고 닫기/계속 고르기" 묻기', await until(() => p.$('.srch .ask')) && (await p.$eval('.srch .ask', (e) => e.textContent)).includes('1곡'))
  await p.click('.srch .ask-back')
  check('[계속 고르기] → 창 그대로, 선곡 그대로', !(await p.$('.srch .ask')) && !!(await p.$('.srch')) && (await state(p)).setlist.length === 2)
  await p.keyboard.press('Escape') // (커서가 검색칸 밖 — [계속 고르기]를 눌렀으므로) 바로 닫기 요청
  check('Esc 로 닫으려 해도 묻기', await until(() => p.$('.srch .ask')))
  await p.keyboard.press('Escape')
  check('묻는 창에서 Esc → 묻는 창만 닫힘', await until(async () => !(await p.$('.srch .ask'))) && !!(await p.$('.srch')))
  await p.click('.srch .x'); await p.waitForSelector('.srch .ask')
  await p.click('.srch .ask-drop')
  check('[추가한 곡 빼고 닫기] → 창 닫히고 넣은 곡만 빠짐', await until(async () => !(await p.$('.srch'))) && (await state(p)).setlist.length === 1)
  await openList(p)
  check('다시 열면 새로 셈(이번에 추가 0)', (await foot(p)).includes('이번에 추가한 곡 없음'))
  await p.click('.srch .x')
  check('넣은 곡이 없으면 ✕ → 묻지 않고 닫힘', await until(async () => !(await p.$('.srch'))))
  await openList(p)
  await p.$$eval('.srch .add', (bs) => bs[0].click()); await sleep(200)
  await p.click('.srch-foot .done')
  check('[완료] → 묻지 않고 닫힘, 넣은 곡 남음', await until(async () => !(await p.$('.srch'))) && (await state(p)).setlist.length === 2)
  await openList(p)
  await p.$$eval('.srch .add', (bs) => bs[1].click()); await sleep(200)
  await p.click('.srch .x'); await p.waitForSelector('.srch .ask')
  await p.click('.srch .ask-keep')
  check('[그대로 두고 닫기] → 넣은 곡 남음', await until(async () => !(await p.$('.srch'))) && (await state(p)).setlist.length === 3)

  const m = await (await b.createBrowserContext()).newPage()
  m.on('dialog', (d) => d.accept())
  await open(m, 280, 640, true)
  await openList(m)
  await m.$$eval('.srch .add', (bs) => bs[0].click()); await sleep(300)
  const ov = await m.evaluate(() => [...document.querySelectorAll('.srch-foot, .srch-foot *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) }).length)
  check('폰 280px: 아래 줄 넘침 없음', ov === 0, `${ov}개`)
  await m.screenshot({ path: path.join(OUT, 'addundo-280.png') })
  await m.evaluate(() => history.back())
  check('폰: 뒤로가기로 닫으려 해도 묻기(페이지는 그대로)', await until(() => m.$('.srch .ask')) && m.url().endsWith('/local'))
  const ov2 = await m.evaluate(() => [...document.querySelectorAll('.ask, .ask *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) }).length)
  check('폰 280px: 묻는 창 넘침 없음', ov2 === 0, `${ov2}개`)
  await m.screenshot({ path: path.join(OUT, 'addundo-ask-280.png') })
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
