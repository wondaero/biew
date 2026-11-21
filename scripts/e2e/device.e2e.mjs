// 기기별 화면 E2E: 폰·태블릿(모바일 OS) 홈 정리 · 태블릿 '출력 시작' 경고 · 넓은 화면 보기(/view) = 송출 화면처럼
//  - 모바일 OS 판정은 UA(+ 아이패드는 '맥 UA + 터치')로 — 폭이 아니라 OS 기준이라 UA 를 바꿔 확인한다
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
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(200) } return false }

const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
}
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, browser, code

async function page(ua, w, h, touch = 0) {
  const p = await (await browser.createBrowserContext()).newPage()
  await p.setUserAgent(ua)
  await p.setViewport({ width: w, height: h })
  if (touch) await p.evaluateOnNewDocument((n) => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n }), touch)
  return p
}
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  code = (await owner.rpc('create_channel', { p_title: `Lorem device ${randomBytes(2).toString('hex')}`, p_control_password: 'ctlpass1' })).data
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })

  // ── 홈: 폰(아이폰) ──
  const phone = await page(UA.iphone, 390, 844, 5)
  await phone.goto(BASE + '/', { waitUntil: 'networkidle0' })
  const ph = await phone.evaluate(() => ({
    join: !!document.querySelector('form.join-inline'),
    joinTop: (() => { const j = document.querySelector('form.join-inline'), t = document.querySelector('.hd-tools'); return !!j && !!t && j.getBoundingClientRect().top < t.getBoundingClientRect().top })(),
    local: !!document.querySelector('button.local-open'),
    songs: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('곡 다운로드')),
    create: !!document.querySelector('button.create-open'),
  }))
  check('폰 홈: 로컬 송출 버튼 없음', !ph.local, JSON.stringify(ph))
  check('폰 홈: 곡 다운로드 없음', !ph.songs, JSON.stringify(ph))
  check('폰 홈: 맨 위 = 채널 번호로 입장', ph.join && ph.joinTop, JSON.stringify(ph))
  check('폰 홈: 채널 만들기 있음', ph.create, JSON.stringify(ph))

  // ── 홈: 윈도우 PC(터치 노트북 — 터치 포인트 10) ──
  const pc = await page(UA.win, 1280, 900, 10)
  await pc.goto(BASE + '/', { waitUntil: 'networkidle0' })
  // PC 로 취급 → 넓은 PC 홈(HomeDesk): 로컬 송출 버튼·곡 다운로드 버튼 있음
  const desk = await pc.evaluate(() => ({
    desk: !document.querySelector('form.join-inline'),
    local: !!document.querySelector('button.local-open'),
    songs: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('곡 다운로드')),
  }))
  check('터치 노트북(윈도우) 홈: PC 화면 — 로컬 송출·곡 다운로드 버튼 있음', desk.desk && desk.local && desk.songs, JSON.stringify(desk))

  // ── 출력 시작: 아이패드(맥 UA + 터치, 가로 1180px → 버튼 보임) ──
  const ipad = await page(UA.ipad, 1180, 820, 5)
  let dialogMsg = null
  ipad.on('dialog', (d) => { dialogMsg = d.message(); d.dismiss() })
  await ipad.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  const outTargets = () => browser.targets().filter((t) => t.url().includes('/output/')).length
  const before = outTargets()
  await ipad.click('button.primary.desk-only')
  await until(async () => dialogMsg !== null, 3000)
  await sleep(800)
  check('아이패드: 출력 시작 → 경고 창', !!dialogMsg && dialogMsg.includes('폰·태블릿'), String(dialogMsg).slice(0, 40))
  check('아이패드: 경고에서 취소 → 출력 창 안 열림', outTargets() === before)

  // ── 출력 시작: 윈도우 PC → 경고 없이 바로 ──
  const pcl = await page(UA.win, 1280, 900, 10)
  let pcDialog = null
  pcl.on('dialog', (d) => { pcDialog = d.message(); d.dismiss() })
  await pcl.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await pcl.click('button.primary.desk-only')
  check('윈도우 터치 노트북: 경고 없이 출력 창 열림', await until(async () => outTargets() > before, 5000) && pcDialog === null, String(pcDialog))

  // ── 넓은 화면 보기 = 송출 화면처럼 ──
  const wide = await page(UA.win, 1280, 720)
  await wide.goto(`${BASE}/view/${code}`, { waitUntil: 'networkidle0' })
  check('넓은 보기: 송출 화면(.stage)', await until(async () => !!(await wide.$('.stage'))))
  check('넓은 보기: 연결되면 상태 점 숨김', await until(async () => (await wide.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중') && !(await wide.$('.wdot'))))
  check('넓은 보기: 커서 숨김', (await wide.$eval('.stage', (e) => getComputedStyle(e).cursor)) === 'none')
  check('넓은 보기: 전체화면 안내 표시', !!(await wide.$('.stage .hint')))
  check('넓은 보기: html.is-output(검정 바탕·스크롤 없음)', await wide.evaluate(() => document.documentElement.classList.contains('is-output')))

  // ── 좁은 화면 보기 = 가사 목록(그대로) ──
  const narrow = await page(UA.iphone, 390, 844, 5)
  await narrow.goto(`${BASE}/view/${code}`, { waitUntil: 'networkidle0' })
  check('폰 보기: 가사 목록 화면(.viewer), is-output 아님', await until(async () => !!(await narrow.$('.viewer'))) && !(await narrow.evaluate(() => document.documentElement.classList.contains('is-output'))))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
