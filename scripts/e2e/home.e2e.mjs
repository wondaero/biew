// 홈 E2E(폰 화면): 공개 채널 목록(보기 비밀번호 있는 것만, 입장 버튼 보기·컨트롤) · 제목 검색(대소문자·띄어쓰기 무시) · 이 기기의 채널(역할)
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
  await p.setViewport({ width: 390, height: 844 })
  p.on('dialog', (d) => d.accept())
  const sectionText = async (h) => p.$$eval('section.card', (els, h) => els.find((e) => e.querySelector('h2')?.textContent?.startsWith(h))?.textContent ?? '', h)
  const typeSearch = async (v) => { await p.$eval('input.search', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); if (v) await p.type('input.search', v) }

  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  check('폰 홈: 공개 채널에 비밀번호 있는 채널(A) 보임', await until(async () => (await sectionText('공개 채널')).includes(`Lorem 주일 2부 ${tag}`)))
  check('폰 홈: 비밀번호 없는 채널(B)은 공개 목록에 없음', !(await sectionText('공개 채널')).includes(`Ipsum 청년부 ${tag}`))
  await typeSearch(`LOREM주일 2  부 ${tag.toUpperCase()}`)
  check('검색: 대소문자·띄어쓰기 무시로 A 찾음', await until(async () => (await sectionText('공개 채널')).includes(`Lorem 주일 2부 ${tag}`)))
  await typeSearch(`ipsum${tag}`)
  check('검색: 공개 아닌 B 는 공개 목록에 안 나옴', await until(async () => (await sectionText('공개 채널')).includes('검색 결과 없음')))
  await typeSearch('')

  // 공개 목록에서 A → 보기 비밀번호
  const pubBtn = (label) => p.$$eval('section.card li.pub-item', (lis, [t, label]) => {
    const li = lis.find((x) => x.textContent?.includes(t))
    const b = [...(li?.querySelectorAll('button') ?? [])].find((x) => x.textContent?.trim() === label)
    b?.click(); return !!b
  }, [`Lorem 주일 2부 ${tag}`, label])
  check('공개 채널: 입장 버튼 2개(보기·컨트롤)', await p.$$eval('section.card li.pub-item', (lis, t) => {
    const li = lis.find((x) => x.textContent?.includes(t)); return [...(li?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim()).join('|')
  }, `Lorem 주일 2부 ${tag}`) === '보기로 입장|컨트롤로 입장')
  check('공개 채널 "컨트롤로 입장" → 컨트롤 비밀번호 화면', (await pubBtn('컨트롤로 입장')) && !!(await p.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 8000 }).catch(() => null)))
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await until(async () => (await sectionText('공개 채널')).includes(`Lorem 주일 2부 ${tag}`))
  await pubBtn('보기로 입장')
  check('공개 채널 "보기로 입장" → 보기 비밀번호 화면', !!(await p.waitForSelector('input[type=password]', { timeout: 8000 }).catch(() => null)))
  await p.type('input[type=password]', 'viewpw1')
  await p.keyboard.press('Enter')
  check('비밀번호 입력 → 보기 화면', await until(async () => (await p.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중')))

  // B 는 QR/링크(번호)로
  await p.goto(`${BASE}/view/${B}`, { waitUntil: 'networkidle0' })
  check('비밀번호 없는 B: 번호(QR·링크)로 바로 보기', await until(async () => (await p.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중')))
  // A 리모컨
  await p.goto(`${BASE}/control/${A}`, { waitUntil: 'networkidle0' })
  await p.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 8000 })
  await p.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await p.keyboard.press('Enter')
  await p.waitForSelector('.control.remote', { timeout: 8000 })

  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  const dev = await sectionText('이 기기의 채널')
  check('이 기기의 채널: A(보기)·A(리모컨)·B(보기)', dev.includes(`Lorem 주일 2부 ${tag}`) && dev.includes('리모컨') && dev.includes(`Ipsum 청년부 ${tag}`) && (dev.match(/보기/g) ?? []).length >= 2, dev.slice(0, 200))
  await typeSearch(`ipsum 청년 부${tag}`)
  check('검색: 이 기기의 채널도 필터(B 만)', await until(async () => { const t = await sectionText('이 기기의 채널'); return t.includes(`Ipsum 청년부 ${tag}`) && !t.includes(`Lorem 주일 2부 ${tag}`) }))
  await typeSearch('')
  // 이 기기의 채널에서 A(보기) → 비밀번호 없이
  await p.$$eval('section.card li', (lis, t) => lis.find((li) => li.textContent?.includes(t) && li.querySelector('.role')?.textContent === '보기')?.click(), `Lorem 주일 2부 ${tag}`)
  check('이 기기의 채널에서 A(보기) → 비밀번호 없이 바로', await until(async () => (await p.$eval('body', (b) => b.textContent ?? '')).includes('송출 대기 중')) && !(await p.$('input[type=password]')))
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  // B 지우기
  await p.$$eval('section.card li', (lis, t) => lis.find((li) => li.textContent?.includes(t))?.querySelector('button.x')?.click(), `Ipsum 청년부 ${tag}`)
  check('✕ 로 이 기기 목록에서 지움', await until(async () => !(await sectionText('이 기기의 채널')).includes(`Ipsum 청년부 ${tag}`)))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  for (const c of codes) if (c) await admin.from('channels').delete().eq('code', c)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
