// 홈 E2E(폰 — 아이폰 UA): 번호 입력칸 맨 위 · 채널 카드 탭(공개 = 보기 비밀번호 있는 것만, 입장 버튼 보기·컨트롤) · 제목 검색(대소문자·띄어쓰기 무시) · 이 기기의 채널(역할)
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const server = await ensureServer('dev', 5179) // 개발 서버가 없으면 띄우고 끝나면 끈다
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(200) } return false }
const tag = randomBytes(2).toString('hex')
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, browser
const codes = []
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  const A = (await owner.rpc('create_channel', { p_title: `Lorem 주일 2부 ${tag}`, p_control_password: 'ctlpass1', p_view_password: 'viewpw1' })).data
  const B = (await owner.rpc('create_channel', { p_title: `Ipsum 청년부 ${tag}`, p_control_password: 'ctlpass2' })).data
  codes.push(A, B)

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const p = await (await browser.createBrowserContext()).newPage()
  // 실제 폰으로 판정되게 아이폰 UA(번호 입력칸이 맨 위, 로컬 송출·곡 다운로드 없음)
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  p.on('dialog', (d) => d.accept())
  // 채널 카드(번호 하나 = 카드 하나) — 탭으로 거른다
  const tab = (label) => p.$$eval('nav.tabs button', (bs, l) => bs.find((b) => b.textContent?.trim().startsWith(l))?.click(), label)
  const listText = () => p.$eval('section.hd-list', (e) => e.textContent ?? '').catch(() => '')
  const cardText = (t) => p.$$eval('li.ch', (lis, t) => lis.find((li) => li.textContent?.includes(t))?.textContent ?? '', t)
  const cardBtn = (t, sel, label) => p.$$eval('li.ch', (lis, [t, sel, label]) => {
    const li = lis.find((x) => x.textContent?.includes(t))
    const b = [...(li?.querySelectorAll(sel) ?? [])].find((x) => !label || x.textContent?.trim().startsWith(label))
    b?.click(); return !!b
  }, [t, sel, label])
  const typeSearch = async (v) => { await p.$eval('input.search', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); if (v) await p.type('input.search', v) }
  const A_T = `Lorem 주일 2부 ${tag}`, B_T = `Ipsum 청년부 ${tag}`

  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  check('폰 홈: 번호 입력칸이 맨 위, 로컬 송출·곡 다운로드 없음', !!(await p.$('form.join-inline input.code')) && !(await p.$('button.local-open'))
    && !(await p.$$eval('button', (bs) => bs.some((b) => b.textContent?.includes('곡 다운로드')))))
  await tab('공개')
  check('공개 탭: 비밀번호 있는 채널(A) 보임', await until(async () => (await listText()).includes(A_T)))
  check('공개 탭: 비밀번호 없는 채널(B) 없음', !(await listText()).includes(B_T))
  await typeSearch(`LOREM주일 2  부 ${tag.toUpperCase()}`)
  check('검색: 대소문자·띄어쓰기 무시로 A 찾음', await until(async () => (await listText()).includes(A_T)))
  await typeSearch(`ipsum${tag}`)
  check('검색: 공개 아닌 B 는 공개 탭에 안 나옴', await until(async () => (await listText()).includes('조건에 맞는 채널이 없습니다')))
  await typeSearch('')

  check('공개 채널 카드: 입장 버튼 2개(보기·컨트롤)', (await p.$$eval('li.ch', (lis, t) => [...(lis.find((x) => x.textContent?.includes(t))?.querySelectorAll('.ch-go button') ?? [])].map((b) => b.textContent?.trim()).join('|'), A_T)) === '보기|컨트롤')
  check('"컨트롤" → 컨트롤 비밀번호 화면', (await cardBtn(A_T, '.ch-go button', '컨트롤')) && !!(await p.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 8000 }).catch(() => null)))
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await until(async () => (await listText()).includes(A_T))
  await cardBtn(A_T, '.ch-go button', '보기')
  check('"보기" → 보기 비밀번호 화면', !!(await p.waitForSelector('input[type=password]', { timeout: 8000 }).catch(() => null)))
  await p.type('input[type=password]', 'viewpw1')
  await p.keyboard.press('Enter')
  check('비밀번호 입력 → 보기 화면', await until(async () => (await p.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중')))

  // B 는 번호로(맨 위 입력칸) — 비밀번호 없이
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await p.type('form.join-inline input.code', B)
  await p.click('form.join-inline button[type=submit]')
  check('번호 입력칸으로 B 보기(비밀번호 없음)', await until(async () => (await p.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중')))
  // A 리모컨
  await p.goto(`${BASE}${A.match(/^\d{6}$/) ? `/${A}/control` : `/control/${A}`}`, { waitUntil: 'networkidle0' })
  await p.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 8000 })
  await p.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await p.keyboard.press('Enter')
  await p.waitForSelector('.control.remote', { timeout: 8000 })

  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await tab('이 기기')
  const a = await cardText(A_T), bb = await cardText(B_T)
  check('이 기기 탭: A 카드 하나에 리모컨·보기 배지, B 는 보기', a.includes('리모컨') && a.includes('보기') && bb.includes('보기') && (await p.$$eval('li.ch', (lis, t) => lis.filter((x) => x.textContent?.includes(t)).length, A_T)) === 1, `${a.slice(0, 80)} / ${bb.slice(0, 80)}`)
  await typeSearch(`ipsum 청년 부${tag}`)
  check('검색: 이 기기 탭도 필터(B 만)', await until(async () => { const t = await listText(); return t.includes(B_T) && !t.includes(A_T) }))
  await typeSearch('')
  // A [보기] → 비밀번호 없이(이 기기에 보기 입장 기록)
  await cardBtn(A_T, '.ch-go button', '보기')
  check('이 기기 A [보기] → 비밀번호 없이 바로', await until(async () => (await p.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중')) && !(await p.$('input[type=password]')))
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await tab('이 기기')
  await cardBtn(B_T, '.ch-more .link', '이 기기 목록에서 지우기')
  check('이 기기 목록에서 B 지움', await until(async () => !(await listText()).includes(B_T)))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  for (const c of codes) if (c) await admin.from('channels').delete().eq('code', c)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
