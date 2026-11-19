// 컨트롤러 사용성 E2E(2026-11-19 피드백) — 로컬 송출, Lorem 콘티·곡(IndexedDB). 서버·계정 안 씀.
// 곡 목록: 곡 누르기 = 보기·수정, [+ 콘티] = 추가 · 송출 화면 누르면 목록에서 송출 중 장으로 · ✎ 는 곡 제목 아래로 ·
// 폰 출력 설정 슬라이더: 그 위를 끌어도 값 안 바뀜(스크롤), 한 번 눌러 켠 뒤에만 조절 · 버튼 보통 크기.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')))
const many = (n) => Array.from({ length: n }, (_, j) => `Lorem ipsum ${j}\nSed do eiusmod`)
const seed = () => ({
  version: Date.now(), origin: 'e2e', itemIndex: 2, slideIndex: 7, blank: false, frozen: null, style: {},
  setlist: [0, 1, 2].map((i) => ({ key: 'k' + i, songId: 'd' + i, title: 'Lorem ' + i, slides: many(10) })),
})
async function open(p, w, h, mobile) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(async (s) => {
    localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s))
    await new Promise((res, rej) => {
      const r = indexedDB.open('biew', 2)
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('songs', { keyPath: 'id' }); d.createObjectStore('meta'); d.createObjectStore('pending', { keyPath: 'id' }) }
      r.onsuccess = () => { const t = r.result.transaction('songs', 'readwrite'); const now = new Date().toISOString(); ['Lorem alpha', 'Ipsum beta'].forEach((x, i) => t.objectStore('songs').put({ id: 'lib-' + i, title: x, slides: ['Lorem ipsum', 'Sed do'], source_file: null, updated_at: now, deleted_at: null })); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej }
      r.onerror = rej
    })
  }, seed())
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.waitForSelector('.cell .card')
}
const visibleIn = (p, sel) => p.evaluate((sel) => { const g = document.querySelector('.grid-wrap').getBoundingClientRect(); const c = document.querySelector(sel)?.getBoundingClientRect(); return !!c && c.top >= g.top - 1 && c.bottom <= g.bottom + 1 }, sel)

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  // ── PC ──
  const p = await (await browser.createBrowserContext()).newPage()
  p.on('dialog', (d) => d.accept())
  await open(p, 1400, 800, false)
  check('PC: 사이드바 버튼 이름 "곡 목록"', (await p.$eval('.side-actions .find', (b) => b.textContent)).includes('곡 목록'))

  // 송출 화면 누르면 송출 중 장으로
  await p.$eval('.grid-wrap', (g) => { g.scrollTop = 0 })
  await sleep(300)
  check('(준비) 송출 중 장이 화면 밖', !(await visibleIn(p, '.card.live')))
  await p.click('.monitors .screen.jump')
  await sleep(900)
  check('송출 화면 누르기 → 목록이 송출 중 장으로', await visibleIn(p, '.card.live'))
  check('송출 화면 누르기 = 송출 안 바뀜', (await state(p)).slideIndex === 7)

  // 곡 목록
  await p.click('.side-actions .find')
  await p.waitForSelector('.srch input.search')
  await p.type('.srch input.search', 'Lorem')
  await p.waitForSelector('.srch ol.hits li .add')
  check('곡 목록 팝업 제목', (await p.$eval('.srch h2', (e) => e.textContent)) === '곡 목록')
  const n0 = (await state(p)).setlist.length
  await p.click('.srch ol.hits li .title')
  await sleep(400)
  check('곡 누르기 → 편집기(보기·수정) 열림, 콘티 그대로', !!(await p.$('.dialog textarea')) && (await state(p)).setlist.length === n0)
  await p.keyboard.press('Escape'); await sleep(300)
  check('Esc → 편집기만 닫힘', !(await p.$('.dialog textarea')) && !!(await p.$('.srch')))
  await p.click('.srch ol.hits li .add')
  await sleep(300)
  check('[+ 콘티] → 콘티에 추가', (await state(p)).setlist.length === n0 + 1)
  await p.focus('.srch input.search'); await p.keyboard.press('Enter'); await sleep(300)
  check('Enter → 콘티에 추가(키보드 빠른 길 유지)', (await state(p)).setlist.length === n0 + 2)
  const fs = await p.$eval('.srch ol.hits li .add', (b) => parseFloat(getComputedStyle(b).fontSize))
  check('[+ 콘티] 보통 크기(14px)', fs === 14, `${fs}px`)
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await sleep(300)

  // 작은 버튼 → 보통 크기
  const sizes = await p.evaluate(() => [...document.querySelectorAll('.tools button, .set-wrap .ghost, .style-sum button')].map((b) => parseFloat(getComputedStyle(b).fontSize)))
  check('전체 접기·비우기·⚙ 설정 버튼 14px', sizes.length >= 3 && sizes.every((s) => s === 14), JSON.stringify(sizes))

  // ── 폰 ──
  const m = await (await browser.createBrowserContext()).newPage()
  await open(m, 360, 740, true)
  // ✎ 는 곡 제목(고정 머리) 아래로
  const z = await m.evaluate(() => [getComputedStyle(document.querySelector('.song h3')).zIndex, getComputedStyle(document.querySelector('.cell .edit')).zIndex].map(Number))
  check('폰: 곡 제목이 ✎ 보다 위(스크롤 시 ✎ 가 제목을 가리지 않음)', z[0] > z[1], JSON.stringify(z))
  const gap = await m.$eval('.cell', (c) => c.getBoundingClientRect().right - c.querySelector('.edit').getBoundingClientRect().right)
  check('폰: ✎ 오른쪽 여백 ≥ 8px', gap >= 7.5, `${gap}px`)
  // 배치(2026-11-19): 위 = 상단 바 → 준비 버튼 줄 → 송출 화면, 맨 아래 = 송출 버튼 한 줄 [BLANK][FREEZE][◀][▶] 같은 폭, 아이콘만
  const lay = await m.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect()
    const order = ['.blank', '.freeze', '.prev', '.next'].map((s) => r('.transport ' + s))
    return {
      dock: r('.dock').bottom, mon: r('.monitors').top, tb: r('.transport').bottom, h: innerHeight, topGroup: !!document.querySelector('.top .group'),
      oneRow: order.every((x) => Math.abs(x.top - order[0].top) < 1), leftToRight: order.every((x, i) => i === 0 || x.left > order[i - 1].left),
      sameWidth: Math.abs(order[3].width - order[0].width) < 1, iconsOnly: [...document.querySelectorAll('.transport .lbl')].every((e) => getComputedStyle(e).display === 'none'),
      svg: document.querySelectorAll('.transport svg').length,
    }
  })
  check('폰: 준비 버튼 줄이 송출 화면 위', lay.dock <= lay.mon + 1, JSON.stringify(lay))
  check('폰: 송출 버튼이 맨 아래 한 줄 [BLANK][FREEZE][◀][▶] 같은 폭, 상단 바엔 없음', Math.abs(lay.tb - lay.h) < 2 && lay.oneRow && lay.leftToRight && lay.sameWidth && !lay.topGroup, JSON.stringify(lay))
  check('폰: 송출 버튼은 그린 아이콘만(글자 숨김)', lay.iconsOnly && lay.svg === 4, JSON.stringify(lay))
  check('폰: 도크 "곡 목록"', (await m.$$eval('.dock button', (bs) => bs[0].textContent)).includes('곡 목록'))
  await m.$eval('.grid-wrap', (g) => { g.scrollTop = 0; window.scrollTo(0, 0) })
  await sleep(300)
  await m.tap('.monitors .screen.jump')
  await sleep(900)
  const liveVis = await m.evaluate(() => { const c = document.querySelector('.card.live').getBoundingClientRect(); return c.top >= 0 && c.bottom <= innerHeight })
  check('폰: 송출 화면 누르기 → 송출 중 장이 보임', liveVis)

  // 전체 화면 팝업 + 송출 중 한 줄 + 곡 수정 머리 두 줄(✕ 가 화면 안)
  const full = (sel) => m.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return Math.abs(r.left) < 1 && Math.abs(r.top) < 1 && Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1 })
  await m.$$eval('.dock button', (bs) => bs[0].click()); await m.waitForSelector('.srch input.search'); await sleep(400)
  check('폰: 곡 목록 = 전체 화면', await full('.srch'))
  check('폰: 곡 목록에 송출 중 한 줄', await m.$eval('.srch .onair-strip', (e) => getComputedStyle(e).display !== 'none' && e.textContent.includes('Lorem 2')))
  await m.type('.srch input.search', 'Lorem'); await m.waitForSelector('.srch ol.hits li .title'); await m.click('.srch ol.hits li .title'); await m.waitForSelector('.dialog header.two')
  check('폰: 곡 편집기 = 전체 화면, ✕ 가 화면 안', await full('.dialog') && await m.$eval('.dialog header .x', (b) => b.getBoundingClientRect().right <= innerWidth))
  await m.evaluate(() => history.back()); await sleep(300); await m.evaluate(() => history.back()); await sleep(400)
  await m.$$eval('.dock button', (bs) => bs[1].click()); await sleep(500)
  check('폰: 콘티 = 전체 화면', await full('.set-wrap.open'))
  await m.evaluate(() => history.back()); await sleep(400)

  // 미리보기 후 송출(두 화면 나란히): 화면 높이·위치가 같고 송출 버튼이 화면 안
  await m.click('.mode input'); await sleep(400)
  const pv = await m.$$eval('.monitors .mon', (ms) => ms.map((x) => { const s = x.querySelector('.screen').getBoundingClientRect(); return [Math.round(s.top), Math.round(s.height)] }))
  const take = await m.$eval('.monitors .take', (b) => b.getBoundingClientRect().right <= innerWidth)
  check('폰 미리보기 모드: 두 화면 높이·위치 같음, 송출 버튼 화면 안', pv.length === 2 && pv[0][0] === pv[1][0] && pv[0][1] === pv[1][1] && take, JSON.stringify(pv))
  await m.click('.mode input'); await sleep(300)

  // 출력 설정 슬라이더 안전장치
  await m.$$eval('.dock button', (bs) => bs[2].click())
  await sleep(600)
  check('폰: 슬라이더 안내 문구', await m.$eval('.style-sheet .guard-hint', (e) => getComputedStyle(e).display !== 'none'))
  const range = '.style-sheet input[type=range]'
  const before = await m.$eval(range, (e) => e.value)
  const box = await m.$eval(range, (e) => { e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height / 2 } })
  const top0 = await m.$eval('.style-sheet', (e) => e.scrollTop)
  // 슬라이더 위에서 위로 끌기(스크롤 동작)
  const cdp = await m.createCDPSession()
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', box.x, box.y)
  for (let k = 1; k <= 8; k++) { await touch('touchMove', box.x + k * 4, box.y - k * 20); await sleep(16) }
  await touch('touchEnd'); await sleep(500)
  check('폰: 꺼진 슬라이더 위를 끌면 값 그대로', (await m.$eval(range, (e) => e.value)) === before)
  check('폰: 그 끌기로 시트가 스크롤됨', (await m.$eval('.style-sheet', (e) => e.scrollTop)) !== top0)
  check('폰: 꺼진 슬라이더는 터치 안 받음', await m.$eval(range, (e) => getComputedStyle(e).pointerEvents === 'none'))
  // 한 번 눌러 켜기 → 조절
  await sleep(1000) // 관성 스크롤이 끝나게
  await m.$eval(range, (e) => e.scrollIntoView({ block: 'center' })); await sleep(600) // 위쪽 고정 미리보기 밑에 있으면 못 누름
  const b2 = await m.$eval(range, (e) => { const r = e.closest('label').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 8 } })
  await m.touchscreen.tap(b2.x, b2.y); await sleep(200)
  const armed = await m.$eval(range, (e) => e.hasAttribute('data-armed') && getComputedStyle(e).pointerEvents !== 'none')
  check('폰: 그 줄을 누르면 슬라이더 켜짐(값은 그대로)', armed && (await m.$eval(range, (e) => e.value)) === before, JSON.stringify({ armed, b2, v: await m.$eval(range, (e) => e.value), before, at: await m.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e?.tagName + '.' + e?.className + '|' + e?.closest('label')?.textContent?.slice(0, 10) + '|' + innerHeight }, b2.x, b2.y) }))
  const r3 = await m.$eval(range, (e) => { const r = e.getBoundingClientRect(); return { l: r.left, w: r.width, y: r.top + r.height / 2 } })
  await touch('touchStart', r3.l + r3.w * 0.5, r3.y)
  for (let k = 1; k <= 6; k++) { await touch('touchMove', r3.l + r3.w * (0.5 + k * 0.06), r3.y); await sleep(16) }
  await touch('touchEnd'); await sleep(300)
  check('폰: 켜진 슬라이더는 조절됨', (await m.$eval(range, (e) => e.value)) !== before)
  await sleep(500)
  await m.$eval('.style-sheet', (e) => { e.scrollTop += 120; e.dispatchEvent(new Event('scroll')) }); await sleep(200)
  check('폰: 스크롤하면 다시 꺼짐', !(await m.$eval(range, (e) => e.hasAttribute('data-armed'))))
  await m.screenshot({ path: path.join(OUT, 'ui-style-guard.png') })
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
