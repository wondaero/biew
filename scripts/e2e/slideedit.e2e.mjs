// 슬라이드 한 장 고치기(카드 ✎) E2E — 로컬 송출, Lorem 선곡 + PC 새 곡(IndexedDB pending) 하나. 서버·계정 안 씀.
// 선곡 즉시 반영·송출 중 장 반영·같은 글 모두·곡 원본(그 글만)·오늘만·빈 줄 = 장 나누기(송출 위치 따라감)·장 삭제(송출 중이면 BLANK)·Esc/뒤로가기·단축키 막힘·폰(280px) 넘침.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
/** 곡 끝 빈 장(shared/endSlide.ts) 뺀 장들 */
const real = (sl) => sl.filter((x) => x !== 'biew-end:')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }
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
      const r = indexedDB.open('biew', 3)
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('songs', { keyPath: 'id' }); d.createObjectStore('meta'); d.createObjectStore('pending', { keyPath: 'id' }); d.createObjectStore('media', { keyPath: 'id' }) }
      r.onsuccess = () => { const t = r.result.transaction('pending', 'readwrite'); t.objectStore('pending').put({ id: 'local-e2e', kind: 'new', title: 'Lorem A', slides: song, base: null, savedAt: new Date().toISOString() }); t.oncomplete = () => { r.result.close(); res() }; t.onerror = rej }
      r.onerror = rej
    })
  }, seed(), SONG)
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.waitForSelector('.cell .card')
}
// ⋯ 메뉴 → 편집 / 복사 (2026-11-25 — 예전 ✎ 자리)
const cellMenu = async (p, item, j) => { await p.$$eval(`[data-item="${item}"] .cell .more`, (bs, j) => bs[j].click(), j); await p.waitForSelector('.more-menu') }
const cellEdit = async (p, item, j) => { await cellMenu(p, item, j); await p.click('.more-menu .m-edit') }
const cellCopy = async (p, item, j) => { await cellMenu(p, item, j); await p.click('.more-menu .m-copy') }
const headerBtn = (p, item, cls) => p.$eval(`[data-item="${item}"] h3 .${cls}`, (b) => b.click())
const changedMark = (p, item) => p.$(`[data-item="${item}"] h3 .changed`)
const setText = (p, t) => p.$eval('.se textarea', (e, t) => { e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })) }, t)

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  // ── PC ──
  const p = await (await browser.createBrowserContext()).newPage()
  p.on('dialog', (d) => d.accept())
  await open(p, 1400, false)
  const op = await p.$eval('.cell .more', (e) => getComputedStyle(e).opacity)
  check('PC: ⋯ 는 평소 숨김', op === '0', `opacity=${op}`)
  await p.hover('[data-item="0"] .cell:nth-child(1)')
  await sleep(150)
  check('PC: 카드에 마우스 올리면 ⋯ 보임', (await p.$eval('[data-item="0"] .cell:nth-child(1) .more', (e) => getComputedStyle(e).opacity)) === '1')
  await cellMenu(p, 0, 0)
  check('⋯ 메뉴: [편집] [복사]', !!(await p.$('.more-menu .m-edit')) && !!(await p.$('.more-menu .m-copy')))
  await p.click('.more-backdrop'); await sleep(150)
  check('메뉴 바깥 누르면 닫힘', !(await p.$('.more-menu')))

  // 송출 중인 장(2장) — 같은 글이 4장에도 있음
  const before = await state(p)
  await cellEdit(p, 0, 1)
  await p.waitForSelector('.se')
  check('⋯ → 편집 = 송출 아님(위치 그대로)', (await state(p)).slideIndex === 1 && (await state(p)).version === before.version)
  check('같은 글 2장 체크 표시', (await p.$$eval('.se .chk', (ls) => ls.map((l) => l.textContent))).some((t) => t.includes('2장')))
  check('송출 중 안내', !!(await p.$('.se .air')))
  check('열린 동안 송출 단축키 막힘', await (async () => { await p.keyboard.press('ArrowRight'); return (await state(p)).slideIndex === 1 })())
  await setText(p, 'Sed do\n\ntempor')
  check('빈 줄 → "2장으로 나뉩니다" + 미리보기 2개', (await p.$eval('.se .split', (e) => e.textContent).catch(() => '')).includes('2장') && (await p.$$('.se .pvs .pv')).length === 2)
  await setText(p, '')
  check('빈 글 → 저장 막힘', await p.$eval('.se footer .primary', (b) => b.disabled) && !!(await p.$('.se .err')))
  check('"같은 글 모두" 기본 꺼짐', !(await p.$eval('.se .chk input', (e) => e.checked)))
  await p.$eval('.se .chk input', (e) => e.click()) // 이번엔 모두 고치기
  await setText(p, 'Sed do eiusmod  \ntempor FIXED')
  await p.keyboard.down('Control'); await p.keyboard.press('Enter'); await p.keyboard.up('Control')
  await sleep(500)
  let s = await state(p)
  check('Ctrl+Enter 저장 → 창 닫힘', !(await p.$('.se')))
  check('선곡: 같은 글 2장 모두 고쳐짐(줄 끝 공백 정리)', s.setlist[0].slides[1] === 'Sed do eiusmod\ntempor FIXED' && s.setlist[0].slides[3] === s.setlist[0].slides[1])
  check('선곡: 다른 장·장 수·위치 그대로', real(s.setlist[0].slides).length === 4 && s.setlist[0].slides[0] === SONG[0] && s.itemIndex === 0 && s.slideIndex === 1 && !s.blank)
  check('곡 원본은 그대로(오늘 선곡만 — 임시)', JSON.stringify(await pendingSong(p)) === JSON.stringify(SONG))
  check('곡 제목 줄에 "변경됨" + [저장]', !!(await changedMark(p, 0)) && !!(await p.$('[data-item="0"] h3 .save-item')))
  check('알림 표시', !!(await p.$('.se-notice')))
  await headerBtn(p, 0, 'save-item')
  check('[저장] → 곡 원본 = 지금 슬라이드, "변경됨" 사라짐', await until(async () => JSON.stringify(await pendingSong(p)) === JSON.stringify(real((await state(p)).setlist[0].slides)) && !(await changedMark(p, 0))))
  await p.screenshot({ path: path.join(OUT, 'slideedit-pc.png') })

  // 저장 안 하면 임시
  await cellEdit(p, 0, 0)
  await p.waitForSelector('.se')
  check('같은 글 1장이면 "모두" 체크 없음 · 원본 저장 체크박스 없음', (await p.$$('.se .chk')).length === 0)
  await setText(p, 'Lorem ipsum\ndolor TODAY')
  await p.click('.se footer .primary')
  await sleep(400)
  s = await state(p)
  const saved1 = await pendingSong(p)
  check('임시: 선곡은 바뀜, 곡 원본은 그대로, 변경됨 표시', s.setlist[0].slides[0] === 'Lorem ipsum\ndolor TODAY' && saved1[0] !== 'Lorem ipsum\ndolor TODAY' && !!(await changedMark(p, 0)))
  check('오늘 고친 곡엔 "↻ 최신" 안 뜸(누르면 오늘 고친 게 사라지므로 — 원본이 바뀐 게 아님)', !(await p.$('.set-wrap .upd')))
  check('선곡 목록에도 변경 표시(•)', !!(await p.$('.set-wrap .chg')))

  // 원본 없는 곡 → [저장] 하면 경고(곡 목록에 없음)
  await cellEdit(p, 1, 0)
  await p.waitForSelector('.se')
  await setText(p, 'Lorem\nipsum X')
  await p.click('.se footer .primary')
  await sleep(400)
  check('원본 없는 곡: 선곡은 고침', (await state(p)).setlist[1].slides[0] === 'Lorem\nipsum X')
  // 원본 지문이 없던 예전 저장본도 처음 고치는 순간 기준이 잡혀 "변경됨"으로 추적된다. 곡 목록에 없는 곡이라 [저장] 하면 경고
  check('예전 항목도 처음 고치면 "변경됨"으로 추적', !!(await changedMark(p, 1)))
  await headerBtn(p, 1, 'save-item')
  check('곡 목록에 없는 곡 [저장] → 경고 알림', await until(async () => (await p.$eval('.se-notice.warn', (e) => e.textContent).catch(() => '')).includes('곡 목록에 없어')))

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
  const saveSplit = async (j, txt, all = false) => { await cellEdit(p, 0, j); await p.waitForSelector('.se'); if (all) await p.$eval('.se .chk input', (e) => e.click()); await setText(p, txt); await p.click('.se footer .primary'); await sleep(400) }
  const onAirText = async () => { const x = await state(p); return x.setlist[x.itemIndex].slides[x.slideIndex] }
  const airBefore = await onAirText()
  await saveSplit(0, 'Lorem A1\n\nLorem A2') // 송출 중(3장)보다 앞 → 4장으로
  s = await state(p)
  check('앞 장 나누기: 장 수 +1, 송출 번호 +1, 송출 글 그대로', real(s.setlist[0].slides).length === 5 && s.slideIndex === 3 && (await onAirText()) === airBefore, JSON.stringify({ n: real(s.setlist[0].slides).length, i: s.slideIndex }))
  await saveSplit(3, 'Ut X1\n\nUt X2') // 송출 중인 장 자체 → 번호 그대로, 첫 장이 송출
  s = await state(p)
  check('송출 중인 장 나누기: 번호 그대로, 나눈 첫 장이 송출', real(s.setlist[0].slides).length === 6 && s.slideIndex === 3 && (await onAirText()) === 'Ut X1')
  // 뒤 장(같은 글 2곳 — 송출 중보다 앞 1곳, 뒤 1곳) 모두 나누기
  await saveSplit(5, 'S1\n\nS2', true)
  s = await state(p)
  check('같은 글 모두 나누기: 앞쪽 1곳만큼 번호 밀림, 송출 글 그대로', real(s.setlist[0].slides).length === 8 && s.slideIndex === 4 && (await onAirText()) === 'Ut X1', JSON.stringify({ n: real(s.setlist[0].slides).length, i: s.slideIndex, sl: s.setlist[0].slides }))
  check('카드도 8장으로(+ 곡 끝 빈 장 카드)', (await p.$$('[data-item="0"] .cell:not(.end-cell)')).length === 8 && (await p.$$('[data-item="0"] .cell.end-cell')).length === 1)
  check('나누기 알림', (await p.$eval('.se-notice', (e) => e.textContent).catch(() => '')).includes('2장으로 나눴습니다'))

  // 장 삭제(2026-11-22): 앞을 지우면 번호가 당겨지고 송출 글 그대로 · 곡 원본은 그대로(임시) · 송출 중인 장을 지우면 BLANK · 마지막 한 장은 못 지움
  // (지금 선곡: Lorem A1, Lorem A2, S1, S2, Ut X1(송출 중), Ut X2, S1, S2)
  const del = async (item, j) => { await cellEdit(p, item, j); await p.waitForSelector('.se'); await p.click('.se footer .del'); await sleep(600) }
  const air2 = await onAirText()
  await del(0, 0)
  s = await state(p)
  check('앞 장 삭제: 장 수 -1, 송출 번호 -1, 송출 글 그대로', real(s.setlist[0].slides).length === 7 && s.slideIndex === 3 && (await onAirText()) === air2 && !s.blank, JSON.stringify({ n: real(s.setlist[0].slides).length, i: s.slideIndex }))
  const songBefore = (await pendingSong(p))?.length
  await del(0, 4) // Ut X2 — 송출 중(3) 뒤, 곡 원본에도 한 장 있음
  s = await state(p)
  check('뒤 장 삭제: 송출 번호 그대로', real(s.setlist[0].slides).length === 6 && s.slideIndex === 3 && (await onAirText()) === air2)
  check('삭제: 곡 원본은 그대로(임시 — [저장]해야 바뀜)', (await pendingSong(p))?.length === songBefore, `${songBefore} → ${(await pendingSong(p))?.length}`)
  check('삭제 알림', (await p.$eval('.se-notice', (e) => e.textContent).catch(() => '')).includes('1장 지웠습니다'))
  await del(0, 3) // 송출 중인 장
  s = await state(p)
  check('송출 중인 장 삭제 → BLANK, 위치는 그 자리로 당겨진 다음 장', real(s.setlist[0].slides).length === 5 && s.blank === true && s.slideIndex === 3, JSON.stringify({ n: real(s.setlist[0].slides).length, i: s.slideIndex, b: s.blank }))
  // FREEZE 중인 장은 못 지움(송출은 고정 글, 목록의 '송출 중' 표시가 옆 장으로 옮겨 가 헷갈리므로)
  await p.$$eval('button', (bs) => bs.find((b) => b.textContent?.includes('BLANK') && b.className.includes('on'))?.click()) // BLANK 풀기
  await sleep(200)
  await p.keyboard.press('f'); await sleep(300)
  s = await state(p)
  await cellEdit(p, 0, s.frozen?.slideIndex ?? 0); await p.waitForSelector('.se')
  check('FREEZE 중인 장은 삭제 버튼 꺼짐', !!s.frozen && await p.$eval('.se footer .del', (b) => b.disabled), JSON.stringify({ frozen: !!s.frozen }))
  await p.click('.se footer button:not(.primary):not(.del)'); await sleep(200)
  await cellEdit(p, 1, 0); await p.waitForSelector('.se')
  check('곡의 마지막 한 장은 삭제 버튼 꺼짐', await p.$eval('.se footer .del', (b) => b.disabled))
  await p.click('.se footer button:not(.primary):not(.del)'); await sleep(200)

  // ⋯ → 복사(2026-11-25): 바로 뒤에 같은 장, 오늘 선곡만
  let before2 = (await state(p)).setlist[0].slides
  await cellCopy(p, 0, 1)
  await sleep(400)
  s = await state(p)
  check('⋯ → 복사: 바로 뒤에 같은 장(장 수 +1)', real(s.setlist[0].slides).length === real(before2).length + 1 && s.setlist[0].slides[2] === before2[1] && s.setlist[0].slides[1] === before2[1], JSON.stringify(s.setlist[0].slides.length))

  // ⋯ → 삭제(2026-11-25): 그 장 하나만(같은 가사의 다른 장은 그대로)
  before2 = (await state(p)).setlist[0].slides
  await cellMenu(p, 0, 2); await p.click('.more-menu .m-del'); await sleep(400)
  s = await state(p)
  check('⋯ → 삭제: 그 장 하나만(같은 가사의 다른 장은 남음)', real(s.setlist[0].slides).length === real(before2).length - 1 && s.setlist[0].slides[1] === before2[1], JSON.stringify(s.setlist[0].slides.length))
  // 편집 창의 삭제도 그 장 하나만("같은 글 모두"가 켜져 있어도 — 예전엔 같은 가사를 모두 지우려 했음)
  await cellCopy(p, 0, 1); await sleep(300)
  before2 = (await state(p)).setlist[0].slides
  await cellEdit(p, 0, 2); await p.waitForSelector('.se')
  check('편집 창 삭제 버튼 = "이 장 삭제"', (await p.$eval('.se footer .del', (b) => b.textContent?.trim())) === '이 장 삭제')
  await p.click('.se footer .del'); await sleep(500)
  s = await state(p)
  check('편집 창 삭제: 같은 글 모두 체크와 무관하게 그 장 하나만', real(s.setlist[0].slides).length === real(before2).length - 1 && s.setlist[0].slides[1] === before2[1])

  // 끌어서 순서 바꾸기(2026-11-25): 1번 카드를 3번 자리로 — 클릭(송출)로 처리되지 않음
  before2 = (await state(p)).setlist[0].slides
  const v0 = (await state(p)).itemIndex + ':' + (await state(p)).slideIndex
  const cards = await p.$$('[data-item="0"] .cell .card')
  const a = await cards[0].boundingBox(), b = await cards[2].boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  for (let k = 1; k <= 12; k++) { await p.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * k) / 12, a.y + a.height / 2 + ((b.y - a.y) * k) / 12); await sleep(30) }
  await p.mouse.move(b.x + b.width * 0.75, b.y + b.height / 2); await sleep(100)
  await p.mouse.up()
  await sleep(600)
  s = await state(p)
  check('끌어서 순서 바꾸기: 1번 장이 뒤로(오늘 선곡)', s.setlist[0].slides[0] === before2[1] && s.setlist[0].slides.includes(before2[0]) && s.setlist[0].slides.indexOf(before2[0]) > 0, JSON.stringify(s.setlist[0].slides.map((x) => x.split('\n')[0])))
  check('끌기 = 송출 아님(위치 같은 장 따라감)', `${s.itemIndex}` === v0.split(':')[0])

  // 고친 곡의 [편집] → 그대로 저장 = 오늘 고친 내용이 원본에 저장(되돌아가지 않음 — 리뷰에서 찾은 버그)
  const today = (await state(p)).setlist[0].slides
  await headerBtn(p, 0, 'h-btn:not(.save-item):not(.exclude)')
  await p.waitForSelector('.dialog textarea', { timeout: 5000 })
  await p.$$eval('.dialog footer button.primary, .dialog button.primary', (bs) => bs.at(-1).click())
  check('고친 곡 [편집] → 그대로 저장: 오늘 슬라이드 유지 + 원본에 저장', await until(async () => JSON.stringify((await state(p)).setlist[0].slides) === JSON.stringify(today) && JSON.stringify(await pendingSong(p)) === JSON.stringify(real(today)) && !(await changedMark(p, 0))), JSON.stringify({ n: (await state(p)).setlist[0].slides.length }))
  // 다시 고쳐 두기(아래 선곡 제외·송출 종료 확인용)
  await cellCopy(p, 0, 0); await sleep(300)

  // 송출 종료 → 고친 곡이 있으면 [저장하고][버리고][취소]
  await p.click('.endlocal')
  check('송출 종료 + 고친 곡 → 저장/버리기 묻는 창', !!(await p.waitForSelector('.xc', { timeout: 3000 }).catch(() => null)))
  await p.click('.xc .cancel'); await sleep(300)
  check('[취소] → 송출 종료 안 함(선곡 그대로)', (await state(p)).setlist.length === 2)

  // 곡 제목 줄 [선곡 제외] — 고친 곡이면 [저장하고 제외][버리고 제외][취소]
  check('고친 곡: 제목 줄에 "변경됨"', !!(await changedMark(p, 0)))
  await headerBtn(p, 0, 'exclude')
  check('[선곡 제외] → 저장/버리기 묻는 창', !!(await p.waitForSelector('.xc', { timeout: 3000 }).catch(() => null)))
  await p.click('.xc .cancel'); await sleep(200)
  check('[취소] → 그대로', !(await p.$('.xc')) && (await state(p)).setlist.length === 2)
  const orig0 = await pendingSong(p)
  await headerBtn(p, 0, 'exclude')
  await p.waitForSelector('.xc')
  await p.click('.xc .discard'); await sleep(400)
  check('[버리고 제외] → 선곡에서 빠짐, 곡 원본은 그대로', (await state(p)).setlist.length === 1 && JSON.stringify(await pendingSong(p)) === JSON.stringify(orig0))

  // ── 폰 280px ──
  const m = await (await browser.createBrowserContext()).newPage()
  await open(m, 280, true)
  check('폰: ⋯ 항상 보임', (await m.$eval('.cell .more', (e) => getComputedStyle(e).opacity)) === '1')
  const o = await m.$eval('[data-item="0"] .cell', (c) => { const a = c.getBoundingClientRect(), b = c.querySelector('.more').getBoundingClientRect(); return b.right <= a.right + 1 && b.left >= a.left })
  check('폰: ⋯ 가 카드 안', o)
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
