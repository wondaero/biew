// 오프라인 E2E: PWA 오프라인 열기 · 오프라인 모드 송출 · 오프라인 곡 수정/등록 · 온라인 복귀 후 올리기(중복/충돌).
// 데이터: E2E-<rand> Lorem 테스트 곡만 만들고 끝나면 삭제. 실제 곡·가사·키는 출력하지 않는다.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { PROJ, CHROME } from './_lib.mjs'

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const PORT = 5180, BASE = `http://localhost:${PORT}`

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch { /* retry */ } await sleep(250) }
  return false
}

let server
const startServer = async () => {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { cwd: PROJ, stdio: 'ignore' })
  return until(async () => (await fetch(BASE + '/').catch(() => null))?.ok, 20000)
}
const stopServer = async () => { server?.kill(); server = null; return until(async () => !(await fetch(BASE + '/').catch(() => null)), 10000) }

const tag = 'E2E-' + randomBytes(3).toString('hex')
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`
const password = randomBytes(12).toString('base64url')
let userId, browser
const songIds = []

try {
  // 테스트 곡 2개(서버)
  const ins = await admin.from('songs').insert([
    { title: `${tag} Alpha`, slides: ['Lorem ipsum alpha one', 'Lorem ipsum alpha two'] },
    { title: `${tag} Beta`, slides: ['Sed do beta one', 'Sed do beta two'] },
  ]).select('id,title')
  if (ins.error) throw new Error('테스트 곡 생성 실패: ' + ins.error.message)
  for (const r of ins.data) songIds.push(r.id)
  const [idA, idB] = songIds
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })
  if (u.error) throw new Error('임시 계정 생성 실패: ' + u.error.message)
  userId = u.data.user.id

  check('배포용 빌드 서버 시작', await startServer())
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] })
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  page.on('pageerror', (e) => errors.push('page: ' + String(e.message).slice(0, 160)))
  page.on('dialog', (d) => d.accept())
  const text = (sel, p = page) => p.$eval(sel, (e) => e.textContent ?? '').catch(() => '')

  // ── 1. 온라인에서 한 번 열기 → 서비스 워커가 앱 저장 ──
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'networkidle0' })
  check('서비스 워커가 페이지를 관리(앱 저장됨)', await page.evaluate(() => !!navigator.serviceWorker.controller))
  check('새 버전 알림 없음(첫 설치)', !(await page.$('.upd')))

  // ── 2. 곡 다운로드(그때 로그인) ──
  await page.locator('::-p-text(곡 다운로드)').click()
  await page.waitForSelector('input[name=username]', { timeout: 5000 })
  await page.type('input[name=username]', email)
  await page.type('input[name=password]', password)
  await page.locator('form.login button').click()
  check('곡 다운로드 완료(1000곡 이상 저장)', await until(async () => {
    const n = parseInt((await text('main')).match(/(\d+)곡 저장됨/)?.[1] ?? '0', 10)
    return n >= 1000 && (await text('main')).includes('마지막 다운로드')
  }, 60000))

  // ── 3. 완전 오프라인: 서버 끄기 + 네트워크 차단 ──
  await page.setOfflineMode(true)
  check('앱 서버 종료', await stopServer())
  await page.reload({ waitUntil: 'domcontentloaded' })
  check('오프라인 새로고침해도 앱이 열림', await until(async () => (await text('h1')) === 'Biew'))
  await page.goto(BASE + '/local', { waitUntil: 'domcontentloaded' })
  check('오프라인에서 /local 직접 열기', await until(() => page.$('aside.side .set-wrap')))
  check('오프라인 모드: 채널 버튼 없음', !(await page.$('button.share')))

  // ── 4. 오프라인 모드 송출: 저장된 곡 검색 → 콘티 → 출력 창 ──
  // 곡 검색 = 팝업: '/' 로 열고 → 입력 → Enter 추가 → Esc(검색어 지움) → Esc(닫기)
  await page.keyboard.press('/')
  await page.waitForSelector('.srch input.search', { timeout: 5000 })
  await page.type('input.search', `${tag} Alpha`)
  await page.keyboard.press('Enter')
  check('저장된 곡으로 콘티 추가(검색 팝업에 추가 알림)', await until(async () => (await page.$$('.song')).length === 1) && !!(await page.$('.srch .added')))
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  check('Esc 두 번 → 검색 팝업 닫힘', await until(async () => !(await page.$('.srch'))))
  await page.locator('.song .card').click()
  const out = await ctx.newPage()
  await out.goto(BASE + '/output/LOCAL', { waitUntil: 'domcontentloaded' })
  check('오프라인에서 출력 창 열림 + 송출 표시', await until(async () => (await text('.txt', out)).startsWith('Lorem ipsum alpha one')))
  // 송출 글꼴 = 앱에 포함된 Pretendard(서버 없이 PC 저장본에서). 테스트 Chrome 엔 Pretendard 가 설치돼 있지 않으므로 로드 성공 = 앱 파일
  check('오프라인 출력: 앱에 포함된 Pretendard 로 그림', await until(() => out.evaluate(async () => {
    const fam = getComputedStyle(document.querySelector('.txt')).fontFamily
    await document.fonts.load(`700 40px Pretendard`)
    const face = [...document.fonts].find((f) => f.family.replace(/"/g, '') === 'Pretendard')
    return fam.startsWith('Pretendard') && face?.status === 'loaded'
  })))
  await page.bringToFront()
  await page.click('button[title^="다음"]')
  check('컨트롤러 ▶ → 출력 창 따라감(서버 없이)', await until(async () => (await text('.txt', out)).startsWith('Lorem ipsum alpha two')))
  await out.close()

  // ── 5. 오프라인 곡 수정·등록 ──
  // 곡 검색 팝업을 열어 둔 채로 수정·등록·올리기(라이브러리 기능은 모두 이 팝업 안)
  await page.click('.side-actions .find')
  await page.waitForSelector('.srch input.search', { timeout: 5000 })
  const editSong = async (q, newText) => {
    await page.$eval('input.search', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) })
    await page.type('input.search', q)
    await page.waitForSelector('ol.hits li.sel .edit', { timeout: 5000 })
    await page.click('ol.hits li.sel .edit')
    await page.waitForSelector('.dialog textarea')
    await page.$eval('.dialog textarea', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')) }, newText)
    await page.click('.dialog footer button.primary')
    await page.waitForSelector('.dialog', { hidden: true, timeout: 5000 })
  }
  await editSong(`${tag} Alpha`, 'Lorem ipsum alpha one FIXED\n\nLorem ipsum alpha two')
  await editSong(`${tag} Beta`, 'Sed do beta one MINE\n\nSed do beta two')
  // 새 곡: Alpha 의 '원래' 가사와 같음 → 서버 곡과 가사 중복
  await page.click('.srch button.new')
  await page.waitForSelector('.dialog textarea')
  await page.type('.dialog input', `${tag} Gamma`)
  await page.$eval('.dialog textarea', (e) => { e.value = 'Lorem ipsum alpha one\n\nLorem ipsum alpha two'; e.dispatchEvent(new Event('input')) })
  await page.click('.dialog footer button.primary')
  await page.waitForSelector('.dialog', { hidden: true, timeout: 5000 })
  check('오프라인 저장 → "서버에 올리기 3건"', await until(async () => (await text('button.upload')).includes('3건')))
  check('콘티의 곡에 "↻ 최신" 표시(오프라인 수정 반영)', !!(await page.$('.setlist button.upd')))

  // ── 6. 온라인 복귀 + 그 사이 서버에서 Beta 가 바뀜(충돌) ──
  await admin.from('songs').update({ slides: ['Sed do beta one SERVER', 'Sed do beta two'] }).eq('id', idB)
  check('앱 서버 다시 시작', await startServer())
  await page.setOfflineMode(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.click('button.upload')
  // 로그인은 이 기기에 저장 → 오프라인을 거쳐 돌아와도 다시 로그인하지 않고 바로 분류
  await sleep(1500)
  check('올리기: 저장된 로그인으로 바로(로그인 칸 없음)', !(await page.$('.login-dlg')))
  check('3건 분류됨', await until(async () => (await page.$$('.rows li')).length === 3, 30000))
  const rowInfo = await page.$$eval('.rows li', (lis) => lis.map((li) => ({
    t: li.querySelector('.t')?.textContent, problem: li.classList.contains('problem'), warn: li.textContent?.includes('서버에서도') ? 'changed' : li.textContent?.includes('가사가 같은') ? 'dup' : '',
  })))
  const find = (s) => rowInfo.find((r) => r.t?.endsWith(s))
  check('Alpha 수정: 문제 없음(체크)', find('Alpha')?.problem === false)
  check('Beta 수정: 서버 변경 충돌 감지', find('Beta')?.problem === true && find('Beta')?.warn === 'changed')
  check('Gamma 새 곡: 가사 중복 감지', find('Gamma')?.problem === true && find('Gamma')?.warn === 'dup')
  // 선택: Beta = 내 것으로 덮어쓰기, Gamma = PC 에서 버리기
  await page.$$eval('.rows li', (lis) => {
    for (const li of lis) {
      const t = li.querySelector('.t')?.textContent ?? ''
      const sel = li.querySelector('select')
      if (!sel) continue
      sel.value = t.endsWith('Beta') ? 'mine' : 'discard'
      sel.dispatchEvent(new Event('change'))
    }
  })
  await page.click('.dialog footer button.primary')
  check('3건 처리 완료', await until(async () => (await page.$$('.rows .res.ok')).length === 3, 20000))
  const after = (await admin.from('songs').select('id,title,slides').in('id', [idA, idB])).data ?? []
  check('서버 Alpha = PC 수정본', after.find((r) => r.id === idA)?.slides?.[0] === 'Lorem ipsum alpha one FIXED')
  check('서버 Beta = 내 것(덮어쓰기)', after.find((r) => r.id === idB)?.slides?.[0] === 'Sed do beta one MINE')
  const gamma = (await admin.from('songs').select('id').eq('title', `${tag} Gamma`)).data ?? []
  check('중복 새 곡(Gamma)은 서버에 안 올라감', gamma.length === 0)
  await page.click('.dialog footer button:not(.primary)')
  check('올릴 변경 0건(버튼 사라짐)', await until(async () => !(await page.$('button.upload'))))
  check('새 버전 알림 없음(같은 버전)', !(await page.$('div.upd')))
} catch (e) {
  fail++
  console.error('✖ 중단:', e.message)
} finally {
  // 테스트 곡은 1~2분만 존재 — 끝나면 완전 삭제(DB 에 쌓이지 않게)
  await admin.from('songs').delete().like('title', `${tag}%`)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  await stopServer()
  const uniq = [...new Set(errors)]
  if (uniq.length) { console.log('\n페이지 오류:'); uniq.slice(0, 15).forEach((e) => console.log('  ' + e)) }
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (테스트 곡·임시 계정 정리)`)
  process.exit(fail ? 1 : 0)
}
