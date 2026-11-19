// DB 와 주고받기 E2E(2026-11-19 사용자 결정) — 실제 DB, 임시 스태프 계정 + Lorem 테스트 곡, 끝나면 deleted_at 표시·계정 삭제.
//  평소 저장·삭제 = 이 기기만(DB 그대로) · [⬇ 다운로드]/[⬆ 업로드] = 비밀번호 재확인(5분 안이면 생략) → 목록
//  다운로드: DB 와 다른 곡(새 곡·수정·충돌) + 어디가 다른지 · 골라 받기(안 받은 건 다음에 다시) · 전체 받기(확인창)
//  업로드: 수정·삭제 · 충돌은 직접 고름 · DB 에 반영
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
const row = async (id) => (await admin.from('songs').select('slides,deleted_at').eq('id', id).single()).data

try {
  const ins = await admin.from('songs').insert(['Alpha', 'Beta', 'Gamma'].map((n) => ({ title: `${tag} ${n}`, slides: [`Lorem ${n} one`, `Lorem ${n} two`] }))).select('id,title')
  if (ins.error) throw new Error('테스트 곡 생성 실패: ' + ins.error.message)
  const id = (n) => ins.data.find((r) => r.title.endsWith(n)).id
  const [idA, idB, idC] = [id('Alpha'), id('Beta'), id('Gamma')]
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })
  if (u.error) throw new Error('임시 계정 생성 실패: ' + u.error.message)
  userId = u.data.user.id

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const p = await (await browser.createBrowserContext()).newPage()
  await p.setViewport({ width: 1400, height: 900 })
  p.on('dialog', (d) => d.accept())
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  const count = () => p.$eval('.srch header h2 small', (e) => parseInt(e.textContent, 10)).catch(() => 0)
  const badge = (cls) => p.$eval(`.srch .sync .${cls} .cnt`, (e) => parseInt(e.textContent, 10)).catch(() => 0)
  const search = async (q) => { await p.$eval('.srch input.search', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); await p.type('.srch input.search', q) }
  const openSong = async (n) => { await search(`${tag} ${n}`); await p.waitForSelector('.srch ol.hits li .title'); await p.click('.srch ol.hits li .title'); await p.waitForSelector('.dialog textarea') }

  // 1) 처음: 곡 받기 → 로그인(재확인 창이 로그인 역할) → 전체 받음
  await p.click('.side-actions .find')
  await p.waitForSelector('.srch .sync .download')
  check('곡 목록: 다운로드·업로드 버튼 항상 보임, 로그아웃 버튼 없음', !!(await p.$('.srch .sync .upload')) && !(await p.$('.srch button[title="로그아웃"]')))
  await p.click('.srch .login-first')
  await p.waitForSelector('.login-dlg')
  check('로그인 안 된 상태 = 로그인 창', (await p.$eval('.login-dlg h2', (e) => e.textContent)) === '로그인')
  await p.type('input[name=username]', email); await p.type('input[name=password]', password); await p.click('form.login button')
  check('로그인 → 다운로드 화면 + 처음이라 전체를 받음(1000곡 이상)', await until(async () => !!(await p.$('[aria-label="다운로드"]')) && (await count()) >= 1000, 60000))
  await p.click('[aria-label="다운로드"] footer button:not(.primary)'); await sleep(300)

  // 2) 평소 저장·삭제 = 이 기기만
  await openSong('Alpha')
  await p.$eval('.dialog textarea', (e) => { e.value = 'Lorem Alpha one MINE\n\nLorem Alpha two'; e.dispatchEvent(new Event('input')) })
  await p.click('.dialog footer button.primary'); await p.waitForSelector('.dialog textarea', { hidden: true })
  await openSong('Gamma')
  await p.click('.dialog footer button.del'); await p.waitForSelector('.dialog textarea', { hidden: true })
  await sleep(400)
  check('저장·삭제는 DB 그대로', JSON.stringify((await row(idA)).slides) === JSON.stringify(['Lorem Alpha one', 'Lorem Alpha two']) && !(await row(idC)).deleted_at)
  check('업로드 배지 2(수정 1·삭제 1)', (await badge('upload')) === 2)
  await search(`${tag} Gamma`); await sleep(300)
  check('지운 곡은 이 기기 목록에서 사라짐', (await p.$$('.srch ol.hits li .add')).length === 0)

  // 3) 다른 기기(관리자)가 DB 를 바꿈: Beta 수정, Delta 추가, Alpha 수정(충돌)
  await admin.from('songs').update({ slides: ['Lorem Beta one', 'Lorem Beta two SERVER'] }).eq('id', idB)
  await admin.from('songs').update({ slides: ['Lorem Alpha one SERVER', 'Lorem Alpha two'] }).eq('id', idA)
  const d = await admin.from('songs').insert({ title: `${tag} Delta`, slides: ['Lorem Delta'] }).select('id').single()
  const idD = d.data.id

  // 4) 다운로드(5분 안 — 비밀번호 다시 안 물음) → 목록: Beta 수정, Delta 새 곡, Alpha 충돌(선택 안 됨)
  await p.click('.srch .sync .download')
  await p.waitForSelector('[aria-label="다운로드"] .rows li', { timeout: 20000 })
  check('5분 안이면 비밀번호 다시 안 물음', !(await p.$('.login-dlg')))
  const items = () => p.$$eval('[aria-label="다운로드"] .rows li', (lis) => lis.map((li) => ({ t: li.querySelector('.t').textContent, tag: li.querySelector('.tag').textContent, on: li.querySelector('.line input').checked, sum: li.querySelector('.sum').textContent, conflict: li.classList.contains('conflict') })))
  const mine = (list) => list.filter((x) => x.t.startsWith(tag))
  let L = mine(await items())
  const f = (n) => L.find((x) => x.t.endsWith(n))
  check('다운로드 목록: Beta 수정·Delta 새 곡·Alpha 충돌', f('Beta')?.tag === '수정' && f('Delta')?.tag === '새 곡' && f('Alpha')?.conflict, JSON.stringify(L))
  check('어디가 다른지 요약(Beta = 2장)', f('Beta')?.sum.includes('2장'), f('Beta')?.sum)
  check('충돌(이 기기에서도 고침)은 기본 선택 안 함, 나머지는 선택', f('Alpha')?.on === false && f('Beta')?.on && f('Delta')?.on)
  // Beta 자세히 보기 → 바뀐 글자 강조
  await p.$$eval('[aria-label="다운로드"] .rows li', (lis, tg) => lis.find((li) => li.querySelector('.t').textContent === `${tg} Beta`).querySelector('.more').click(), tag)
  check('자세히: 바뀐 부분 강조(ins)', (await p.$$eval('[aria-label="다운로드"] .sdv ins', (e) => e.map((x) => x.textContent))).includes(' SERVER'))
  // 골라 받기: 내 테스트 곡 중 Delta 는 빼고(다른 곡들도 선택 해제) Beta 만
  await p.$$eval('[aria-label="다운로드"] .rows li', (lis, tg) => { for (const li of lis) { const t = li.querySelector('.t').textContent; const c = li.querySelector('.line input'); if (c.checked !== (t === `${tg} Beta`)) c.click() } }, tag)
  await p.click('[aria-label="다운로드"] footer button.primary')
  check('골라 받기 → Beta 만 받고 목록에서 빠짐, Delta·Alpha 는 남음', await until(async () => { L = mine(await items()); return !f('Beta') && !!f('Delta') && !!f('Alpha') }))
  await search(`${tag} Beta`); await p.click('[aria-label="다운로드"] footer button:not(.primary)'); await sleep(300)

  // 5) 업로드: 새로고침(5분 기억 초기화) → 비밀번호 확인 창(아이디 채워짐) → 충돌 Alpha = 내 것, Gamma 삭제
  await p.evaluate(() => sessionStorage.removeItem('biew.pwAt')) // 5분이 지난 셈
  await p.reload({ waitUntil: 'networkidle0' })
  await p.click('.side-actions .find'); await p.waitForSelector('.srch .sync .upload')
  await p.click('.srch .sync .upload')
  await p.waitForSelector('.login-dlg')
  check('업로드: 비밀번호 확인 창, 아이디 채워짐', (await p.$eval('.login-dlg h2', (e) => e.textContent)) === '비밀번호 확인' && (await p.$eval('input[name=username]', (e) => e.value)) === email)
  await p.type('input[name=password]', password); await p.click('form.login button')
  await p.waitForSelector('.rows li', { timeout: 20000 })
  const up = await p.$$eval('.rows li', (lis) => lis.map((li) => ({ t: li.querySelector('.t').textContent, tag: li.querySelector('.tag').textContent, problem: li.classList.contains('problem') })))
  check('업로드 목록: Alpha 수정(충돌)·Gamma 삭제', up.some((x) => x.t.endsWith('Alpha') && x.problem) && up.some((x) => x.t.endsWith('Gamma') && x.tag === '삭제' && !x.problem), JSON.stringify(up))
  await p.$$eval('.rows li', (lis) => { for (const li of lis) { const s = li.querySelector('select'); if (s && li.querySelector('.t').textContent.endsWith('Alpha')) { s.value = 'mine'; s.dispatchEvent(new Event('change')) } } })
  await p.click('.dialog footer button.primary')
  check('업로드 처리 완료', await until(async () => (await p.$$('.rows .res.ok')).length === 2, 20000))
  check('DB: Alpha = 내 것, Gamma = 삭제', (await row(idA)).slides[0] === 'Lorem Alpha one MINE' && !!(await row(idC)).deleted_at)
  await p.click('.dialog footer button:not(.primary)'); await sleep(300)
  check('업로드 배지 0', (await badge('upload')) === 0)

  // 6) 전체 받기(확인창) → 이 기기 = DB, 건너뛴 Delta 도 받음
  await p.click('.srch .sync .download')
  await p.waitForSelector('[aria-label="다운로드"] .tools .danger-line')
  await until(async () => !(await p.$eval('[aria-label="다운로드"] .body', (e) => e.textContent.includes('비교하는 중'))))
  check('건너뛴 Delta 는 다음에도 목록에 다시 나옴', mine(await items()).some((x) => x.t.endsWith('Delta')))
  await p.click('[aria-label="다운로드"] .tools .danger-line')
  check('전체 받기 완료(목록 비고 Delta 받음)', await until(async () => (await p.$eval('[aria-label="다운로드"] .done', (e) => e.textContent).catch(() => '')).includes('전체'), 60000))
  await p.click('[aria-label="다운로드"] footer button:not(.primary)'); await sleep(300)
  await search(`${tag} Delta`); await sleep(300)
  check('Delta 가 이 기기 목록에', (await p.$$('.srch ol.hits li .add')).length === 1)
  void idD
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await admin.from('songs').update({ deleted_at: new Date().toISOString() }).like('title', `${tag}%`).is('deleted_at', null)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (테스트 곡·임시 계정 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
