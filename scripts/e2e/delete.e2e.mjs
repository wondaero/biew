// 채널 삭제 E2E: 홈 로그인 버튼 → 내 계정의 채널 '삭제'(로그인만으로, 다른 기기에서) · 최근 사용 경고 ·
// 그 채널을 쓰던 호스트 PC 는 '삭제됨' 표시(인터넷 끊김 아님) · 남의 채널은 지워지지 않음(RLS → 0건 = 오류)
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(250) } return false }
const tag = randomBytes(2).toString('hex')
const mkUser = async (domain = 'example.test') => {
  const email = `e2e-${randomBytes(4).toString('hex')}@${domain}`, password = randomBytes(12).toString('base64url')
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })
  if (u.error) throw new Error('임시 계정 생성 실패: ' + u.error.message)
  const c = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
  await c.auth.signInWithPassword({ email, password })
  return { id: u.data.user.id, email, password, c }
}
const users = [], codes = []
let browser
try {
  const me = await mkUser('jv.jv'), other = await mkUser() // me = 로그인 도메인 계정(아이디만으로 로그인 확인)
  users.push(me, other)
  const A = (await me.c.rpc('create_channel', { p_title: `Lorem 삭제 ${tag}`, p_control_password: 'ctlpass1' })).data
  const O = (await other.c.rpc('create_channel', { p_title: `Ipsum 남의 것 ${tag}`, p_control_password: 'ctlpass2' })).data
  codes.push(A, O)

  // 남의 채널: RLS 가 오류 없이 0건으로 걸러 낸다 → 앱(deleteChannel)은 지워진 행 수로 실패를 알아낸다
  const r = await me.c.from('channels').delete().eq('code', O).select('code')
  check('남의 채널 삭제 시도 → 0건(그대로 남음)', !r.error && r.data.length === 0 && !!(await admin.from('channels').select('code').eq('code', O).maybeSingle()).data)

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const page = async (w, h) => { const p = await (await browser.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h }); return p }
  const login = async (p, u, idOnly = false) => {
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await p.click('button.login-btn')
    await p.waitForSelector('.login-dlg input[name=username]', { timeout: 5000 })
    await p.type('.login-dlg input[name=username]', idOnly ? u.email.split('@')[0] : u.email)
    await p.type('.login-dlg input[name=password]', u.password)
    await p.click('.login-dlg form.login button')
  }
  // 내 계정의 채널 글자 = '내 계정' 표시가 붙은 카드들
  const mineText = (p) => p.evaluate(() => {
    return [...document.querySelectorAll('li.ch')].filter((li) => [...li.querySelectorAll('.tag')].some((t) => t.textContent === '내 계정')).map((li) => li.textContent).join(' | ')
  })

  // ── 호스트 PC: 홈에서 로그인 → 내 계정의 채널에서 A 열기(이 PC 가 호스트) ──
  const host = await page(1400, 900)
  check('홈(로그아웃 상태): 머리에 로그인 버튼', (await host.goto(BASE + '/', { waitUntil: 'networkidle0' }), (await host.$eval('button.login-btn', (b) => b.textContent?.trim())) === '로그인'))
  // 공용 로그인 팝업: 열고 Esc → 닫힘(취소)
  await host.click('button.login-btn')
  check('로그인 버튼 → 공용 로그인 팝업(이유 문구·아이디 칸에 커서)', !!(await host.waitForSelector('.login-dlg .reason', { timeout: 5000 }).catch(() => null))
    && (await host.evaluate(() => document.activeElement?.getAttribute('name'))) === 'username')
  await host.keyboard.press('Escape')
  check('Esc → 로그인 팝업 닫힘', await until(async () => !(await host.$('.login-dlg'))))
  // 채널 만들기 → 로그인 팝업 → (여기선 취소) 폼이 열리지 않음
  await host.click('button.create-open')
  await host.waitForSelector('.login-dlg', { timeout: 5000 })
  await host.click('.login-dlg .x')
  check('채널 만들기 → 로그인 취소 → 폼 안 열림', await until(async () => !(await host.$('.login-dlg'))) && !(await host.$('input[placeholder^="채널 제목 ("]')))
  await login(host, me, true) // 아이디만(도메인 자동)
  check('아이디만 입력(도메인 없이)으로 로그인 → 내 계정의 채널에 A, 로그인 칸 닫힘', await until(async () => (await mineText(host)).includes(`Lorem 삭제 ${tag}`)) && !(await host.$('.login-dlg')))
  // 로그인은 이 기기에 저장 → 새로고침해도 유지, 머리에 아이디 표시
  await host.reload({ waitUntil: 'networkidle0' })
  check('새로고침해도 로그인 유지 + 머리에 "아이디 로그인됨"', await until(async () => (await host.$eval('.who', (e) => e.textContent ?? '').catch(() => '')) === `${me.email.split('@')[0]} 로그인됨`) && (await mineText(host)).includes(`Lorem 삭제 ${tag}`))
  // 넓은 PC: 내 계정 카드의 [제어] → 이 PC 가 호스트(역할 고르기 없이, ?as=host)
  check('넓은 PC: 내 계정 카드 버튼 = "제어"', (await host.$$eval('li.ch', (lis, t) => lis.find((li) => li.textContent?.includes(t))?.querySelector('button.ctl')?.textContent?.trim(), `Lorem 삭제 ${tag}`)) === '제어')
  await host.$$eval('li.ch', (lis, t) => lis.find((li) => li.textContent?.includes(t))?.querySelector('button.ctl')?.click(), `Lorem 삭제 ${tag}`)
  await host.waitForSelector('.control', { timeout: 10000 })
  check('호스트 PC: A 연결됨(경고 없음)', await until(async () => !(await host.$('.netwarn')) && (await host.$eval('.share', (e) => e.className)).includes('live'), 15000))

  // ── 다른 기기(폰): 홈 로그인 → A 삭제(채널을 열지 않고) ──
  const phone = await page(390, 844)
  let dialogMsg = ''
  phone.on('dialog', (d) => { dialogMsg = d.message(); d.accept() })
  await login(phone, me)
  await until(async () => (await mineText(phone)).includes(`Lorem 삭제 ${tag}`))
  check('폰: 남의 채널은 내 계정 목록에 없음', !(await mineText(phone)).includes(`Ipsum 남의 것 ${tag}`))
  // 로그인된 폰이 컨트롤 링크를 열면 자동으로 두 번째 호스트가 되지 않고 고른다 → 리모컨 고르면 비밀번호 화면
  await phone.goto(`${BASE}/control/${A}`, { waitUntil: 'networkidle0' })
  check('로그인된 기기로 컨트롤 링크 → 역할 고르기(호스트/리모컨)', !!(await phone.waitForSelector('.choose', { timeout: 8000 }).catch(() => null)))
  await phone.$$eval('.choose button', (bs) => bs.find((b) => b.textContent?.startsWith('리모컨으로'))?.click())
  check('"리모컨으로" → 컨트롤 비밀번호 화면(호스트 등록 안 됨)', !!(await phone.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 8000 }).catch(() => null))
    && !(await phone.evaluate((c) => !!localStorage.getItem('biew.host.' + c), A)))
  await phone.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await until(async () => (await mineText(phone)).includes(`Lorem 삭제 ${tag}`))
  await phone.$$eval('li.ch', (lis, t) => lis.find((li) => li.textContent?.includes(t))?.querySelector('.ch-more .del')?.click(), `Lorem 삭제 ${tag}`)
  check('삭제 확인창: 최근 사용 → "지금 예배 중일 수 있습니다" 경고', await until(async () => dialogMsg.includes('지금 예배 중일 수 있습니다')), dialogMsg.slice(0, 40))
  check('삭제 후 목록에서 사라짐', await until(async () => !(await mineText(phone)).includes(`Lorem 삭제 ${tag}`)))
  check('서버에서도 삭제됨', !(await admin.from('channels').select('code').eq('code', A).maybeSingle()).data)
  check('폰은 호스트로 등록되지 않음(이 기기의 채널에 A 없음)', !(await phone.$$eval('li.ch', (lis, t) => lis.some((li) => li.textContent?.includes(t) && li.querySelector('.role.host')), `Lorem 삭제 ${tag}`)))

  // ── 호스트 PC: 10초 확인 주기 안에 '삭제됨'(인터넷 끊김 아님), 이후에도 그대로 ──
  await host.bringToFront()
  const warn = () => host.$eval('.netwarn', (e) => e.textContent ?? '').catch(() => '')
  check('호스트 PC: "삭제되었습니다" 표시', await until(async () => (await warn()).includes('삭제되었습니다'), 20000), await warn())
  await sleep(16000) // 재시도 주기(15초)를 넘겨도 '인터넷 끊김'으로 바뀌지 않아야
  check('호스트 PC: 재시도 후에도 "인터넷 끊김"으로 바뀌지 않음', (await warn()).includes('삭제되었습니다') && !(await warn()).includes('인터넷 끊김'), await warn())
  await host.keyboard.press('ArrowRight') // PC 조작은 계속(서버로 안 올림)
  check('호스트 PC: 조작해도 경고 유지(송출은 로컬로 계속)', (await warn()).includes('삭제되었습니다'))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  for (const c of codes) if (c) await admin.from('channels').delete().eq('code', c)
  for (const u of users) await admin.auth.admin.deleteUser(u.id)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
