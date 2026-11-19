// 서버에 바로 저장할 때의 충돌 검사 E2E(2026-11-19) — 실제 DB, 임시 스태프 계정 + Lorem 테스트 곡 2개, 끝나면 삭제.
// 1) 평소: 곡 편집기 저장 = 서버에 바로(PC 저장 없음)
// 2) 편집기를 연 뒤 다른 기기(관리자)가 같은 곡을 고침 → 저장해도 서버를 덮어쓰지 않고 PC 에 저장 + 안내, '서버에 올리기'에 충돌로 표시
// 3) 콘티 카드 ✎ 로 원본 저장할 때도 같은 검사
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn().catch(() => false)) return true; await sleep(200) } return false }
const tag = 'E2E-' + randomBytes(3).toString('hex')
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, browser
const serverSlides = async (id) => (await admin.from('songs').select('slides').eq('id', id).single()).data?.slides

try {
  const ins = await admin.from('songs').insert([
    { title: `${tag} Alpha`, slides: ['Lorem alpha one', 'Lorem alpha two'] },
    { title: `${tag} Beta`, slides: ['Sed beta one', 'Sed beta two'] },
  ]).select('id,title')
  if (ins.error) throw new Error('테스트 곡 생성 실패: ' + ins.error.message)
  const idA = ins.data.find((r) => r.title.endsWith('Alpha')).id, idB = ins.data.find((r) => r.title.endsWith('Beta')).id
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })
  if (u.error) throw new Error('임시 계정 생성 실패: ' + u.error.message)
  userId = u.data.user.id

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const p = await (await browser.createBrowserContext()).newPage()
  await p.setViewport({ width: 1400, height: 900 })
  p.on('dialog', (d) => d.accept())
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), {
    version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
    setlist: [{ key: 'kb', songId: idB, title: `${tag} Beta`, slides: ['Sed beta one', 'Sed beta two'] }],
  })
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })

  // 로그인(곡 목록 안) → 곡 받기
  await p.click('.side-actions .find')
  await p.waitForSelector('.srch .login-toggle, .srch .login-first')
  await p.click('.srch .login-toggle, .srch .login-first')
  await p.waitForSelector('input[name=username]')
  await p.type('input[name=username]', email)
  await p.type('input[name=password]', password)
  await p.click('form.login button')
  await p.type('.srch input.search', tag)
  check('(준비) 로그인 후 테스트 곡 2개 받음', await until(async () => (await p.$$('.srch ol.hits li .add')).length === 2, 60000))

  const openSong = async (name) => {
    await p.$eval('.srch input.search', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) })
    await p.type('.srch input.search', `${tag} ${name}`)
    await p.waitForSelector('.srch ol.hits li .title')
    await p.click('.srch ol.hits li .title')
    await p.waitForSelector('.dialog textarea')
  }
  const saveEditor = async (txt) => {
    await p.$eval('.dialog textarea', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')) }, txt)
    await p.click('.dialog footer button.primary')
    await p.waitForSelector('.dialog textarea', { hidden: true, timeout: 8000 })
    await sleep(500)
  }
  const uploadCount = () => p.$eval('.srch .upload', (b) => parseInt(b.textContent.match(/(\d+)건/)?.[1] ?? '0', 10)).catch(() => 0)

  // 1) 평소 = 서버에 바로
  await openSong('Alpha')
  await saveEditor('Lorem alpha one EDIT\n\nLorem alpha two')
  check('평소: 서버에 바로 저장', JSON.stringify(await serverSlides(idA)) === JSON.stringify(['Lorem alpha one EDIT', 'Lorem alpha two']))
  check('평소: PC 저장 없음(서버에 올리기 버튼 없음)', (await uploadCount()) === 0)

  // 2) 편집기를 연 뒤 다른 기기가 고침 → 덮어쓰지 않음
  await openSong('Alpha')
  await admin.from('songs').update({ slides: ['Lorem alpha one SERVER', 'Lorem alpha two'] }).eq('id', idA)
  await saveEditor('Lorem alpha one MINE\n\nLorem alpha two')
  check('충돌: 서버는 다른 기기 수정 그대로(덮어쓰지 않음)', JSON.stringify(await serverSlides(idA)) === JSON.stringify(['Lorem alpha one SERVER', 'Lorem alpha two']))
  check('충돌: PC 에 저장 → 서버에 올리기 1건', (await uploadCount()) === 1)
  check('충돌: 안내 문구', (await p.$eval('.srch .notice', (e) => e.textContent).catch(() => '')).includes('다른 기기'))
  await p.click('.srch .upload')
  check('충돌: 서버에 올리기 창에서 충돌 항목으로 표시', await until(async () => (await p.$$('.rows li.problem')).length === 1, 15000))
  await p.click('.dialog footer button:not(.primary)') // 취소
  await sleep(300)
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await sleep(300)

  // 3) 콘티 카드 ✎ — 원본이 그 사이 바뀜
  await admin.from('songs').update({ slides: ['Sed beta one', 'Sed beta two SERVER'] }).eq('id', idB)
  await p.hover('[data-item="0"] .cell:nth-child(1)')
  await p.click('[data-item="0"] .cell:nth-child(1) .edit')
  await p.waitForSelector('.se textarea')
  await p.$eval('.se textarea', (e) => { e.value = 'Sed beta one FIX'; e.dispatchEvent(new Event('input', { bubbles: true })) })
  await p.click('.se footer .primary')
  await sleep(1500)
  check('✎ 충돌: 콘티는 고쳐짐', (await p.evaluate(() => JSON.parse(localStorage.getItem('biew.live.v1:LOCAL')).setlist[0].slides[0])) === 'Sed beta one FIX')
  check('✎ 충돌: 서버 원본은 다른 기기 수정 그대로', JSON.stringify(await serverSlides(idB)) === JSON.stringify(['Sed beta one', 'Sed beta two SERVER']))
  check('✎ 충돌: 경고 알림', (await p.$eval('.se-notice.warn', (e) => e.textContent).catch(() => '')).includes('다른 기기'))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await admin.from('songs').delete().like('title', `${tag}%`)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (테스트 곡·임시 계정 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
