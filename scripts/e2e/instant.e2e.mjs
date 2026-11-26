// 출력 설정 '바로 적용' E2E(2026-11-22): 기본(미리보기 후 저장) · 바로 적용(출력 창에 즉시, 상태엔 안 남음) · 저장 안 하고 닫으면 되돌림 ·
// 저장하면 유지 · 모드는 기기에 기억 · 컨트롤러 창을 닫으면 되돌림 · 인터넷 송출: 넓은 화면 보기에도 즉시/되돌림/저장.
// 로컬 = 서버 안 씀. 인터넷 = 운영 Supabase 에 임시 계정·Lorem 채널(끝나면 삭제). 가사 없음(Lorem).
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(150) } return false }

const WHITE = 'rgb(255, 255, 255)', RED = 'rgb(255, 0, 0)', GREEN = 'rgb(0, 255, 0)', BLUE = 'rgb(0, 0, 255)', YELLOW = 'rgb(255, 255, 0)'
const seed = () => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: { color: '#ffffff' },
  setlist: [{ key: 'k', songId: 'd', title: 'Lorem', slides: ['Lorem ipsum dolor', 'Sed do eiusmod'] }],
})
/** 화면의 글자색(.txt) */
const txtColor = (p) => p.$eval('.txt', (e) => getComputedStyle(e).color).catch(() => '')
const savedColor = (p, code) => p.evaluate((c) => JSON.parse(localStorage.getItem('biew.live.v1:' + c) ?? '{}').style?.color, code)
const openDialog = async (p) => { await p.$$eval('button', (bs) => bs.find((b) => b.textContent?.includes('⚙ 설정'))?.click()); await p.waitForSelector('.sd', { timeout: 5000 }) }
const setColor = (p, hex) => p.$$eval('.sd label', (ls, hex) => {
  const i = ls.find((l) => l.textContent?.trim().startsWith('글자색'))?.querySelector('input[type=color]')
  i.value = hex; i.dispatchEvent(new Event('input', { bubbles: true }))
}, hex)
const instantBox = (p) => p.$('.sd label.instant input[type=checkbox]')
const saveBtn = (p) => p.click('.sd .sd-foot button.apply')
const pgmColor = (p) => p.$eval('.monitors .screen.jump .txt', (e) => getComputedStyle(e).color).catch(() => '')

const tag = randomBytes(2).toString('hex')
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, code, browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })

  // ── 1. 로컬 송출 + 같은 PC 출력 창 ──
  const ctx = await browser.createBrowserContext()
  const c = await ctx.newPage()
  await c.setViewport({ width: 1400, height: 900 })
  await c.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await c.evaluate((s) => { localStorage.removeItem('biew.styleInstant.v1'); localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)) }, seed())
  await c.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  const out = await ctx.newPage()
  await out.setViewport({ width: 960, height: 540 })
  await out.goto(BASE + '/output/LOCAL', { waitUntil: 'domcontentloaded' })
  check('(준비) 출력 창 흰 글자', await until(async () => (await txtColor(out)) === WHITE))
  await c.bringToFront()
  await openDialog(c)
  check('기본 모드 = 미리보기 후 저장(바로 적용 꺼짐)', !(await (await instantBox(c)).evaluate((e) => e.checked)))
  check('버튼 이름 [적용]', (await c.$eval('.sd .sd-foot', (e) => e.textContent ?? '')).includes('바꾸면 여기서 [적용]'))
  await setColor(c, '#ff0000')
  await sleep(700)
  check('미리보기 모드: 바꿔도 출력 창은 그대로', (await txtColor(out)) === WHITE, await txtColor(out))
  await saveBtn(c)
  check('[저장] → 출력 창 빨강, 저장됨', await until(async () => (await txtColor(out)) === RED) && (await savedColor(c, 'LOCAL')) === '#ff0000')

  await (await instantBox(c)).click()
  check('바로 적용 켜면 안내 표시', !!(await c.$('.sd label.instant.on')))
  await setColor(c, '#00ff00')
  check('바로 적용: 저장 전에도 출력 창 초록', await until(async () => (await txtColor(out)) === GREEN, 3000), await txtColor(out))
  check('바로 적용: 송출 모니터(PGM)도 초록', (await pgmColor(c)) === GREEN, await pgmColor(c))
  check('바로 적용: 상태엔 안 남음(저장된 색은 빨강 그대로)', (await savedColor(c, 'LOCAL')) === '#ff0000')
  await c.keyboard.press('Escape')
  check('저장 안 하고 닫기(Esc) → 출력 창 원래대로(빨강)', await until(async () => (await txtColor(out)) === RED, 3000), await txtColor(out))
  check('닫으면 저장 안 된 변경 표시 없음', !(await c.$('.dock-dot, .side .dot')))

  await openDialog(c)
  check('모드는 기억(다시 열어도 바로 적용 켜짐)', await (await instantBox(c)).evaluate((e) => e.checked))
  await setColor(c, '#0000ff')
  await until(async () => (await txtColor(out)) === BLUE, 3000)
  await saveBtn(c)
  await sleep(500)
  check('바로 적용 + [저장] → 저장됨(파랑)', (await savedColor(c, 'LOCAL')) === '#0000ff')
  await c.keyboard.press('Escape')
  await sleep(800)
  check('저장 뒤 닫아도 출력 창 파랑 유지', (await txtColor(out)) === BLUE, await txtColor(out))
  await sleep(6500)
  check('6초 지나도(임시 설정 시한) 파랑 유지 — 저장된 것', (await txtColor(out)) === BLUE, await txtColor(out))

  await openDialog(c)
  await setColor(c, '#ffff00')
  check('(다시) 바로 적용 → 출력 창 노랑', await until(async () => (await txtColor(out)) === YELLOW, 3000), await txtColor(out))
  await c.close() // 저장 안 하고 컨트롤러 창을 닫음
  check('저장 안 하고 컨트롤러 창 닫기 → 출력 창 원래대로(파랑)', await until(async () => (await txtColor(out)) === BLUE, 8000), await txtColor(out))
  const c2 = await ctx.newPage()
  await c2.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  check('모드는 이 기기에 기억(localStorage)', (await c2.evaluate(() => localStorage.getItem('biew.styleInstant.v1'))) === '1')
  await c2.close()
  // 창 폭을 줄여(≤768px) 팝업이 저절로 사라져도 저장 안 한 변경은 남는다(버리는 건 사용자가 닫을 때만) — 리뷰에서 찾은 버그
  const c3 = await ctx.newPage()
  c3.on('dialog', (d) => d.accept())
  await c3.setViewport({ width: 1400, height: 900 })
  await c3.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await openDialog(c3)
  await setColor(c3, '#ff00ff')
  check('(다시) 바로 적용 → 출력 창 자홍', await until(async () => (await txtColor(out)) === 'rgb(255, 0, 255)', 3000), await txtColor(out))
  await c3.setViewport({ width: 700, height: 900 })
  await sleep(1000)
  check('창 폭을 줄이면 팝업 대신 모바일 설정 시트가 열리고 변경 유지(출력 창 자홍)', !(await c3.$('.sd')) && !!(await c3.$('.style-sheet.open')) && (await txtColor(out)) === 'rgb(255, 0, 255)', await txtColor(out))
  await c3.setViewport({ width: 1400, height: 900 })
  await sleep(1000)
  check('다시 넓히면 PC 설정 팝업으로 이어서 열리고 변경 유지', !!(await c3.$('.sd')) && (await txtColor(out)) === 'rgb(255, 0, 255)', await txtColor(out))
  await c3.setViewport({ width: 700, height: 900 })
  await sleep(800)
  // 앱 안에서 컨트롤러를 나가면(로고 → 채널 목록) '끝' 신호가 연결을 끊기 전에 나가 바로 되돌아간다(6초 시한까지 기다리지 않음)
  const t0 = Date.now()
  await c3.$eval('button.brand', (b) => b.click())
  const back = await until(async () => (await txtColor(out)) === BLUE, 2500)
  check('컨트롤러를 나가면 2.5초 안에 출력 창 원래대로(파랑)', back, `${await txtColor(out)} ${Date.now() - t0}ms`)
  await c3.close(); await out.close()

  // ── 2. 인터넷 송출: 넓은 화면 보기 기기 ──
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  code = (await owner.rpc('create_channel', { p_title: `Lorem 바로 적용 ${tag}`, p_control_password: 'ctlpass1' })).data
  await admin.from('channels').update({ state: seed() }).eq('code', code)
  const g = (await owner.rpc('issue_host_token', { p_code: code })).data?.[0]
  const hctx = await browser.createBrowserContext()
  const host = await hctx.newPage()
  await host.setViewport({ width: 1400, height: 900 })
  await host.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await host.evaluate((c, g) => {
    localStorage.setItem('biew.styleInstant.v1', '1')
    localStorage.setItem('biew.host.' + c, JSON.stringify({ title: g.title, token: g.token, controlTopic: g.control_topic, viewTopic: g.view_topic, openedAt: new Date().toISOString() }))
  }, code, g)
  await host.goto(`${BASE}/${code}/control`, { waitUntil: 'networkidle0' })
  check('(준비) 호스트 PC 연결', await until(() => host.$('button.share.live'), 15000))
  const viewer = await (await browser.createBrowserContext()).newPage()
  await viewer.setViewport({ width: 1280, height: 720 })
  await viewer.goto(`${BASE}/${code}`, { waitUntil: 'networkidle0' })
  check('(준비) 넓은 화면 보기 = 송출 화면, 흰 글자', await until(async () => (await txtColor(viewer)) === WHITE, 10000), await txtColor(viewer))
  await host.bringToFront()
  await openDialog(host)
  await setColor(host, '#00ff00')
  check('인터넷: 바로 적용 → 넓은 화면 보기도 저장 전에 초록', await until(async () => (await txtColor(viewer)) === GREEN, 5000), await txtColor(viewer))
  const srv = async () => (await admin.from('channels').select('state').eq('code', code).single()).data?.state?.style?.color
  check('인터넷: 서버 상태엔 안 남음(흰색 그대로)', (await srv()) === '#ffffff', await srv())
  await host.keyboard.press('Escape')
  check('인터넷: 저장 안 하고 닫기 → 보기 기기 원래대로(흰색)', await until(async () => (await txtColor(viewer)) === WHITE, 5000), await txtColor(viewer))
  await openDialog(host)
  await setColor(host, '#ff0000')
  await until(async () => (await txtColor(viewer)) === RED, 5000)
  await saveBtn(host)
  check('인터넷: [저장] → 서버에 저장(빨강)', await until(async () => (await srv()) === '#ff0000', 8000), await srv())
  await sleep(7000)
  check('인터넷: 저장 후 시한이 지나도 보기 기기 빨강 유지', (await txtColor(viewer)) === RED, await txtColor(viewer))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
