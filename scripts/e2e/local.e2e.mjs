// 로컬 송출 E2E: 두 번째 창 경고 · 송출 종료(출력 창 유지·설정 유지) · 인터넷 송출로 전환(출력 창 끊김 없음). Lorem 더미만.
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const server = await ensureServer('dev', 5179) // 개발 서버가 없으면 띄우고 끝나면 끈다
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(200) } return false }
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, browser, code
const seed = (fontSize) => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 1, blank: false, frozen: null, style: { fontSize },
  setlist: ['Lorem A', 'Ipsum B'].map((t, i) => ({ key: 'k' + i, songId: 'd' + i, title: t, slides: ['Lorem one ' + t, 'Lorem two ' + t] })),
})
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const ctx = await browser.createBrowserContext()
  const ctl = await ctx.newPage()
  await ctl.setViewport({ width: 1400, height: 900 })
  ctl.on('dialog', (d) => d.accept())
  await ctl.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await ctl.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed(9))
  await ctl.reload({ waitUntil: 'networkidle0' })
  const out = await ctx.newPage()
  await out.goto(BASE + '/output/LOCAL', { waitUntil: 'domcontentloaded' })
  const outText = () => out.$eval('.txt', (e) => e.textContent ?? '').catch(() => '')
  check('출력 창: 로컬 송출 표시', await until(async () => (await outText()) === 'Lorem two Lorem A'))

  // ── 두 번째 창 경고 ──
  const ctl2 = await ctx.newPage()
  await ctl2.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  check('두 번째 로컬 컨트롤러 창 → 경고', await until(() => ctl2.$('.dup')))
  check('먼저 연 창엔 경고 없음', !(await ctl.$('.dup')))
  await ctl.close()
  check('먼저 연 창을 닫으면 경고 사라짐(이어받음)', await until(async () => !(await ctl2.$('.dup'))))
  const c = ctl2
  c.on('dialog', (d) => d.accept())
  await c.bringToFront()

  // ── 송출 종료 ──
  await c.click('button.endlocal')
  check('송출 종료 → 선곡 비움', await until(async () => (await c.$$('.song')).length === 0))
  check('출력 창은 열린 채 검은 화면', !out.isClosed() && await until(async () => !(await out.$('.txt'))))
  const saved = await c.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL') ?? 'null'))
  check('출력 설정은 유지(글자 크기 9)', saved?.style?.fontSize === 9 && saved.setlist.length === 0, JSON.stringify(saved?.style))

  // ── 인터넷 송출로 전환 ──
  await c.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed(9))
  await c.reload({ waitUntil: 'networkidle0' })
  check('다시 로컬 송출 표시', await until(async () => (await outText()) === 'Lorem two Lorem A'))
  await out.evaluate(() => { window.__marker = 1 })
  await c.bringToFront()
  await c.locator('::-p-text(🌐 인터넷 송출로 전환)').click()
  await c.waitForSelector('.dialog input[type=password]', { timeout: 5000 })
  check('채널 이름 기본값(오늘 날짜 예배)', (await c.$eval('.dialog input', (e) => e.value)).endsWith('예배'))
  await c.type('.dialog input[type=password]', 'ctlpass1')
  const btnInfo = await c.$eval('.dialog form button.primary', (b) => ({ disabled: b.disabled, rect: b.getBoundingClientRect().toJSON(), visible: !!b.offsetParent }))
  console.log('  · 다음 버튼 상태', JSON.stringify(btnInfo))
  await c.keyboard.press('Enter')
  check('이름·비밀번호 다음 → 로그인', !!(await c.waitForSelector('.login-dlg input[name=username]', { timeout: 5000 }).catch(() => null)))
  await c.type('.login-dlg input[name=username]', email)
  await c.type('.login-dlg input[name=password]', password)
  await c.click('.login-dlg form.login button')
  check('로그인 → 채널 생성 → 인터넷 송출 화면', await c.waitForFunction(() => /^\/(\d{6}\/control|control\/[A-Z2-9]{6})$/.test(location.pathname), { timeout: 15000 }).then(() => true).catch(() => false))
  code = new URL(c.url()).pathname.match(/^\/(?:(\d{6})\/control|control\/([A-Z2-9]{6}))$/)?.slice(1).find(Boolean) // 숫자 /123456/control · 예전 /control/ABC234
  check('📡 창이 자동으로 열림(QR·번호)', !!(await c.waitForSelector('.pop .code', { timeout: 8000 }).catch(() => null)))
  check('선곡·위치 그대로(PGM Lorem A 2/2)', await until(async () => (await c.$eval('.bar.pgm span', (e) => e.textContent ?? '').catch(() => '')).includes('Lorem A · 2/2')))
  check('출력 창: 새로고침 없이 새 채널로 갈아탐', await until(async () => (await out.evaluate(() => window.__marker === 1 && location.pathname)) === `/output/${code}`))
  check('출력 창 화면 유지', (await outText()) === 'Lorem two Lorem A')
  check('서버에 송출 상태 올라감', await until(async () => (await admin.from('channels').select('state').eq('code', code).single()).data?.state?.setlist?.length === 2))
  const localAfter = await c.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL') ?? 'null'))
  check('로컬 송출 선곡은 비워짐(설정 유지)', localAfter?.setlist?.length === 0 && localAfter?.style?.fontSize === 9)
  // 전환 후 PC 조작 → 출력 창 따라감(새 채널)
  await c.bringToFront()
  await c.keyboard.press('Escape')
  await c.click('button[title^="다음"]')
  check('전환 후 PC 조작 → 곡 끝 빈 장(출력 창 빈 화면)', await until(async () => (await outText()) === ''))
  await c.click('button[title^="다음"]')
  check('전환 후 PC 조작 → 출력 창 따라감', await until(async () => (await outText()) === 'Lorem one Ipsum B'))
  // 폰 리모컨
  const phone = await (await browser.createBrowserContext()).newPage()
  await phone.goto(`${BASE}/control/${code}`, { waitUntil: 'networkidle0' })
  await phone.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await phone.keyboard.press('Enter')
  await phone.waitForSelector('.control.remote', { timeout: 10000 })
  await phone.click('button[title^="다음"]')
  check('폰 리모컨 → 출력 창 따라감', await until(async () => (await outText()) === 'Lorem two Ipsum B'))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
