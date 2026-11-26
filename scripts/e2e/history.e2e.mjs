// 선곡 기록 E2E(로컬 송출 — 이 PC IndexedDB, 서버 안 씀). Lorem 더미.
// 2026-11-26: 자동 기록 없음 · [저장](연결된 기록에 덮어쓰기) · [다른 이름으로 저장](새 기록) · 지난 날짜 덮어쓰기 확인 ·
// 항목 누르면 곡 목록 펼침 → [불러오기](송출 대기) · 저장 안 된 선곡 비우기 경고 · 송출 종료 = 연결 끊김 · 이름 · 삭제 · 폰 전체 화면
import puppeteer from 'puppeteer-core'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }

const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(11, 0, 0, 0)
const today = new Date()
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`
const seed = () => ({
  version: yesterday.getTime(), origin: 'e2e', itemIndex: 1, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: [
    { key: 'k0', songId: 'd0', title: 'Lorem A', slides: ['Lorem ipsum', 'Dolor sit'] },
    { key: 'k1', songId: 'd1', title: 'Ipsum B', slides: ['Sed do'] },
  ],
})
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL') ?? '{}'))
const rows = (p) => p.$$eval('.hi .list > li .t', (es) => es.map((e) => e.childNodes[1]?.textContent?.trim()))
const cur = (p) => p.$eval('.hi .cur-info', (e) => e.textContent?.replace(/\s+/g, ' ').trim()).catch(() => '')
const msg = (p) => p.$eval('.hi .msg', (e) => e.textContent).catch(() => '')
const openHist = async (p) => { await p.click('.setlist .hist'); await p.waitForSelector('.hi'); await until(async () => !(await p.$('.hi .muted:not(.empty)')) || (await p.$$('.hi .list > li')).length > 0) }
const closeHist = async (p) => { await p.keyboard.press('Escape'); await until(async () => !(await p.$('.hi'))) }
const setName = async (p, t) => { await p.$eval('.hi .save input', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); await p.type('.hi .save input', t) }

const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage()
  const dialogs = []
  p.on('dialog', (d) => { dialogs.push(d.message()); d.type() === 'prompt' ? d.accept('Lorem 바꾼 이름') : d.accept() })
  await p.setViewport({ width: 1400, height: 900 })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await sleep(3800) // 예전엔 열고 3초 뒤 자동 기록 — 이제는 없어야 함

  await openHist(p)
  check('자동 기록 없음(어제 선곡이 남아 있어도)', (await rows(p)).length === 0, JSON.stringify(await rows(p)))
  check('지금 선곡 = "아직 저장 안 함"', (await cur(p)).includes('아직 저장 안 함'), await cur(p))

  // [저장](연결 없음) = 새 기록(입력칸 이름)
  await p.click('.hi .save-btn')
  check('[저장] → 새 기록(오늘 날짜 이름) + 지금 선곡에 연결', await until(async () => (await rows(p))[0] === `${md(today)} 예배` && (await cur(p)).includes(`「${md(today)} 예배」`) && (await cur(p)).includes('저장됨')), `${JSON.stringify(await rows(p))} / ${await cur(p)}`)
  await closeHist(p)

  // 선곡을 바꾸면 '저장 안 된 변경' → [저장] = 덮어쓰기(기록 수 그대로, 곡 수 바뀜)
  await p.$$eval('.setlist .items li .x', (bs) => bs.at(-1).click()) // Ipsum B 빼기
  await until(async () => (await state(p)).setlist?.length === 1)
  await openHist(p)
  check('선곡을 바꾸면 "저장 안 된 변경" 표시', (await cur(p)).includes('저장 안 된 변경'), await cur(p))
  await p.click('.hi .save-btn')
  check('[저장] = 연결된 기록에 덮어쓰기(기록 1개, 1곡)', await until(async () => (await rows(p)).length === 1 && (await p.$eval('.hi .list > li .d', (e) => e.textContent)).includes('1곡') && (await cur(p)).includes('저장됨')), `${JSON.stringify(await rows(p))} ${await msg(p)}`)

  // [다른 이름으로 저장] = 새 기록, 같은 내용이어도
  await setName(p, 'Lorem 주일')
  await p.click('.hi .save-as')
  check('[다른 이름으로 저장] → 새 기록(같은 내용이어도) + 연결이 새 기록으로', await until(async () => (await rows(p)).length === 2 && (await rows(p))[0] === 'Lorem 주일' && (await cur(p)).includes('「Lorem 주일」')), `${JSON.stringify(await rows(p))} / ${await cur(p)}`)
  check('목록에 "지금 선곡" 표시는 연결된 기록에만', (await p.$$('.hi .list > li.linked')).length === 1 && (await p.$eval('.hi .list > li.linked .t', (e) => e.textContent)).includes('Lorem 주일'))

  // 지난 날짜 기록에 [저장] → 확인
  await p.evaluate((y) => { const k = 'biew.historyLink.LOCAL'; const l = JSON.parse(localStorage.getItem(k)); l.savedAt = y; localStorage.setItem(k, JSON.stringify(l)) }, yesterday.toISOString())
  await closeHist(p); await openHist(p)
  dialogs.length = 0
  await p.click('.hi .save-btn')
  check('지난 날짜 기록에 [저장] → 덮어쓸지 확인', await until(async () => dialogs.some((m) => m.includes('덮어씁니다') && m.includes('다른 이름으로 저장'))), JSON.stringify(dialogs))
  await closeHist(p)

  // 저장 안 된 선곡을 비우면 경고(기록을 안 쓰는 사람은 문구 한 줄만)
  await p.evaluate(() => localStorage.removeItem('biew.historyLink.LOCAL'))
  await p.reload({ waitUntil: 'networkidle0' })
  dialogs.length = 0
  await p.click('.endlocal')
  check('저장 안 된 선곡으로 송출 종료 → 확인창에 "저장되지 않았습니다"', await until(async () => dialogs.some((m) => m.includes('저장되지 않았습니다'))), JSON.stringify(dialogs))
  check('송출 종료 → 선곡 비움, 기록은 그대로(자동 기록 없음)', await until(async () => (await state(p)).setlist?.length === 0))
  await openHist(p)
  check('송출 종료 뒤 기록 2개 그대로 · 지금 선곡 "비어 있음"', (await rows(p)).length === 2 && (await cur(p)).includes('비어 있음'), `${JSON.stringify(await rows(p))} / ${await cur(p)}`)
  check('빈 선곡이면 [저장]·[다른 이름으로 저장] 꺼짐', await p.$eval('.hi .save-btn', (e) => e.disabled) && await p.$eval('.hi .save-as', (e) => e.disabled))

  // 항목 누르기 → 곡 목록 펼침 → [불러오기]
  await p.$$eval('.hi .list > li .info', (bs, t) => bs.find((x) => x.textContent?.includes(t))?.click(), `${md(today)} 예배`)
  check('항목을 누르면 곡 목록이 펼쳐짐(곡 제목·장 수)', await until(async () => (await p.$$eval('.hi .list > li.open .songs li', (ls) => ls.map((l) => l.textContent?.replace(/\s+/g, ' ').trim()))).join('|') === '1Lorem A2장'), JSON.stringify(await p.$$eval('.hi .list > li.open .songs li', (ls) => ls.map((l) => l.textContent))))
  await p.click('.hi .list > li.open .load-row .primary')
  check('[불러오기] → 창 닫힘, 선곡 복원', await until(async () => !(await p.$('.hi')) && (await state(p)).setlist?.length === 1))
  const s = await state(p)
  check('불러오기 → 송출 대기(빈 화면, BLANK 아님), 항목 key 는 새로', s.slideIndex === -1 && s.blank === false && s.setlist.every((x) => x.key !== 'k0'), JSON.stringify({ i: s.itemIndex, j: s.slideIndex, b: s.blank }))
  await openHist(p)
  check('불러온 기록에 연결 + "저장됨"', (await cur(p)).includes(`「${md(today)} 예배」`) && (await cur(p)).includes('저장됨'), await cur(p))

  // 새로고침·오프라인에도 유지(IndexedDB)
  await closeHist(p)
  await p.setOfflineMode(true)
  await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await p.setOfflineMode(false)
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.setOfflineMode(true)
  await openHist(p)
  check('새로고침·인터넷 끊김에도 기록·연결 유지', (await rows(p)).length === 2 && (await cur(p)).includes(`「${md(today)} 예배」`), `${JSON.stringify(await rows(p))} / ${await cur(p)}`)
  await p.setOfflineMode(false)

  // 이름 바꾸기(연결된 기록이면 위 표시도) · 삭제(연결된 기록이면 연결 해제)
  await p.$$eval('.hi .list > li.linked .acts button', (bs) => bs.find((x) => x.textContent?.trim() === '이름')?.click())
  check('이름 바꾸기 → 목록·지금 선곡 표시 모두', await until(async () => (await rows(p)).includes('Lorem 바꾼 이름') && (await cur(p)).includes('「Lorem 바꾼 이름」')), `${JSON.stringify(await rows(p))} / ${await cur(p)}`)
  await p.$$eval('.hi .list > li.linked .acts .danger-line', (bs) => bs[0]?.click())
  check('연결된 기록 삭제 → 목록에서 빠지고 연결 해제("아직 저장 안 함")', await until(async () => (await rows(p)).length === 1 && (await cur(p)).includes('아직 저장 안 함')), `${JSON.stringify(await rows(p))} / ${await cur(p)}`)
  await p.screenshot({ path: OUT + '/history-pc.png' })
  await closeHist(p)

  // 폰: 전체 화면
  const m = await ctx.newPage()
  await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  await m.setViewport({ width: 390, height: 760, isMobile: true, hasTouch: true })
  await m.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await m.$$eval('.dock button', (bs) => bs.find((x) => x.textContent?.includes('선곡'))?.click())
  await sleep(500)
  await m.$eval('.setlist .hist', (x) => x.click())
  await m.waitForSelector('.hi')
  await sleep(300)
  await m.$$eval('.hi .list > li .info', (bs) => bs[0]?.click())
  await sleep(300)
  const box = await m.$eval('.hi', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, ow: document.documentElement.scrollWidth > innerWidth } })
  check('폰: 기록 창 전체 화면, 펼쳐도 가로 넘침 없음', box.w === 390 && box.h === 760 && !box.ow, JSON.stringify(box))
  await m.screenshot({ path: OUT + '/history-phone.png' })
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
