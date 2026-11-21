// 슬라이드 한 장 고치기(카드 ✎) E2E — 로컬 송출, Lorem 선곡 + PC 새 곡(IndexedDB pending) 하나. 서버·계정 안 씀.
// 선곡 즉시 반영·송출 중 장 반영·같은 글 모두·곡 원본(그 글만)·오늘만·빈 줄 = 장 나누기(송출 위치 따라감)·Esc/뒤로가기·단축키 막힘·폰(280px) 넘침.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SONG = ['Lorem ipsum\ndolor sit', 'Sed do eiusmod\ntempor', 'Ut enim ad\nminim veniam', 'Sed do eiusmod\ntempor']
const seed = () => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 1, blank: false, frozen: null, style: {},
  setlist: [{ key: 'k0', songId: 'local-e2e', title: 'Lorem A', slides: [...SONG] }, { key: 'k1', songId: 'nowhere', title: 'Ipsum B', slides: ['Lorem\nipsum'] }],
})
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')))
const pendingSong = (p) => p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('biew'); r.onsuccess = () => { const g = r.result.transaction('pending').objectStore('pending').get('local-e2e'); g.onsuccess = () => res(g.result?.slides ?? null) }
}))

async function open(p, w, mobile) {
  await p.setViewport({ width: w, height: mobile ? 700 : 900, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (s, song) => {
    localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s))
    await new Promise((res, rej) => {
      const r = indexedDB.open('biew', 2)
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('songs', { keyPath: 'id' }); d.createObjectStore('meta'); d.createObjectStore('pending', { keyPath: 'id' }) }
      r.onsuccess = () => { const t = r.result.transaction('pending', 'readwrite'); t.objectStore('pending').put({ id: 'local-e2e', kind: 'new', title: 'Lorem A', slides: song, base: null, savedAt: new Date().toISOString() }); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej }
      r.onerror = rej
    })
  }, seed(), SONG)
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.waitForSelector('.cell .card')
}
const cellEdit = (p, item, j) => p.$$eval(`[data-item="${item}"] .cell .edit`, (bs, j) => bs[j].click(), j)
const setText = (p, t) => p.$eval('.se textarea', (e, t) => { e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })) }, t)

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  // ── PC ──
  const p = await (await browser.createBrowserContext()).newPage()
  p.on('dialog', (d) => d.accept())
  await open(p, 1400, false)
  const op = await p.$eval('.cell .edit', (e) => getComputedStyle(e).opacity)
  check('PC: ✎ 는 평소 숨김', op === '0', `opacity=${op}`)
  await p.hover('[data-item="0"] .cell:nth-child(1)')
  await sleep(150)
  check('PC: 카드에 마우스 올리면 ✎ 보임', (await p.$eval('[data-item="0"] .cell:nth-child(1) .edit', (e) => getComputedStyle(e).opacity)) === '1')

  // 송출 중인 장(2장) — 같은 글이 4장에도 있음
  const before = await state(p)
  await cellEdit(p, 0, 1)
  await p.waitForSelector('.se')
  check('✎ = 송출 아님(위치 그대로)', (await state(p)).slideIndex === 1 && (await state(p)).version === before.version)
  check('같은 글 2장 체크 표시', (await p.$$eval('.se .chk', (ls) => ls.map((l) => l.textContent))).some((t) => t.includes('2장')))
  check('송출 중 안내', !!(await p.$('.se .air')))
  check('열린 동안 송출 단축키 막힘', await (async () => { await p.keyboard.press('ArrowRight'); return (await state(p)).slideIndex === 1 })())
  await setText(p, 'Sed do\n\ntempor')
  check('빈 줄 → "2장으로 나뉩니다" + 미리보기 2개', (await p.$eval('.se .split', (e) => e.textContent).catch(() => '')).includes('2장') && (await p.$$('.se .pvs .pv')).length === 2)
  await setText(p, '')
  check('빈 글 → 저장 막힘', await p.$eval('.se footer .primary', (b) => b.disabled) && !!(await p.$('.se .err')))
  await setText(p, 'Sed do eiusmod  \ntempor FIXED')
  await p.keyboard.down('Control'); await p.keyboard.press('Enter'); await p.keyboard.up('Control')
  await sleep(500)
  let s = await state(p)
  check('Ctrl+Enter 저장 → 창 닫힘', !(await p.$('.se')))
  check('선곡: 같은 글 2장 모두 고쳐짐(줄 끝 공백 정리)', s.setlist[0].slides[1] === 'Sed do eiusmod\ntempor FIXED' && s.setlist[0].slides[3] === s.setlist[0].slides[1])
  check('선곡: 다른 장·장 수·위치 그대로', s.setlist[0].slides.length === 4 && s.setlist[0].slides[0] === SONG[0] && s.itemIndex === 0 && s.slideIndex === 1 && !s.blank)
  const orig = await pendingSong(p)
  check('곡 원본: 그 글만 바뀜', JSON.stringify(orig) === JSON.stringify(s.setlist[0].slides))
  check('알림 표시', !!(await p.$('.se-notice')))
  await p.screenshot({ path: path.join(OUT, 'slideedit-pc.png') })

  // 오늘만(원본 그대로)
  await cellEdit(p, 0, 0)
  await p.waitForSelector('.se')
  check('같은 글 1장이면 "모두" 체크 없음', (await p.$$('.se .chk')).length === 1)
  await setText(p, 'Lorem ipsum\ndolor TODAY')
  await p.$eval('.se .chk input', (e) => e.click()) // 곡 원본에도 저장 끄기
  await p.click('.se footer .primary')
  await sleep(400)
  s = await state(p)
  check('오늘만: 선곡은 바뀜', s.setlist[0].slides[0] === 'Lorem ipsum\ndolor TODAY')
  check('오늘만: 곡 원본은 그대로', (await pendingSong(p))[0] === SONG[0])
  check('오늘만: ↻ 최신 버튼 생김(원본과 다름)', !!(await p.$('.set-wrap .upd')))

  // 원본 없는 곡 → 선곡만 + 경고
  await cellEdit(p, 1, 0)
  await p.waitForSelector('.se')
  await setText(p, 'Lorem\nipsum X')
  await p.click('.se footer .primary')
  await sleep(400)
  check('원본 없는 곡: 선곡은 고침 + 경고 알림', (await state(p)).setlist[1].slides[0] === 'Lorem\nipsum X' && !!(await p.$('.se-notice.warn')))

  // 고친 뒤 Esc → 확인창(accept) → 닫힘, 변경 없음
  const v = (await state(p)).version
  await cellEdit(p, 0, 2)
  await p.waitForSelector('.se')
  await setText(p, 'changed')
  await p.keyboard.press('Escape')
  await sleep(300)
  check('Esc 닫기 → 저장 안 됨', !(await p.$('.se')) && (await state(p)).version === v)
  await cellEdit(p, 0, 2)
  await p.waitForSelector('.se')
  await p.evaluate(() => history.back())
  await sleep(400)
  check('뒤로가기 = 창만 닫힘', !(await p.$('.se')) && p.url().endsWith('/local'))
  await p.keyboard.press('ArrowRight'); await sleep(200)
  check('닫은 뒤 송출 단축키 다시 동작', (await state(p)).slideIndex === 2)

  // 장 나누기(2026-11-19): 송출 위치는 '같은 글'을 따라감 — 앞을 나누면 밀리고, 송출 중·뒤를 나누면 그대로
  const saveSplit = async (j, txt) => { await cellEdit(p, 0, j); await p.waitForSelector('.se'); await setText(p, txt); await p.click('.se footer .primary'); await sleep(400) }
  const onAirText = async () => { const x = await state(p); return x.setlist[x.itemIndex].slides[x.slideIndex] }
  const airBefore = await onAirText()
  await saveSplit(0, 'Lorem A1\n\nLorem A2') // 송출 중(3장)보다 앞 → 4장으로
  s = await state(p)
  check('앞 장 나누기: 장 수 +1, 송출 번호 +1, 송출 글 그대로', s.setlist[0].slides.length === 5 && s.slideIndex === 3 && (await onAirText()) === airBefore, JSON.stringify({ n: s.setlist[0].slides.length, i: s.slideIndex }))
  await saveSplit(3, 'Ut X1\n\nUt X2') // 송출 중인 장 자체 → 번호 그대로, 첫 장이 송출
  s = await state(p)
  check('송출 중인 장 나누기: 번호 그대로, 나눈 첫 장이 송출', s.setlist[0].slides.length === 6 && s.slideIndex === 3 && (await onAirText()) === 'Ut X1')
  // 뒤 장(같은 글 2곳 — 송출 중보다 앞 1곳, 뒤 1곳) 모두 나누기
  await saveSplit(5, 'S1\n\nS2')
  s = await state(p)
  check('같은 글 모두 나누기: 앞쪽 1곳만큼 번호 밀림, 송출 글 그대로', s.setlist[0].slides.length === 8 && s.slideIndex === 4 && (await onAirText()) === 'Ut X1', JSON.stringify({ n: s.setlist[0].slides.length, i: s.slideIndex, sl: s.setlist[0].slides }))
  check('카드도 8장으로', (await p.$$('[data-item="0"] .cell')).length === 8)
  check('나누기 알림', (await p.$eval('.se-notice', (e) => e.textContent).catch(() => '')).includes('2장으로 나눴습니다'))

  // ── 폰 280px ──
  const m = await (await browser.createBrowserContext()).newPage()
  await open(m, 280, true)
  check('폰: ✎ 항상 보임', (await m.$eval('.cell .edit', (e) => getComputedStyle(e).opacity)) === '1')
  const o = await m.$eval('[data-item="0"] .cell', (c) => { const a = c.getBoundingClientRect(), b = c.querySelector('.edit').getBoundingClientRect(); return b.right <= a.right + 1 && b.left >= a.left })
  check('폰: ✎ 가 카드 안', o)
  await cellEdit(m, 0, 0)
  await m.waitForSelector('.se')
  await sleep(300)
  const ov = await m.evaluate(() => [...document.querySelectorAll('.se *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('textarea') }).length)
  check('폰 280px: 수정 창 넘침 없음', ov === 0, `${ov}개`)
  await m.screenshot({ path: path.join(OUT, 'slideedit-280.png') })
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
