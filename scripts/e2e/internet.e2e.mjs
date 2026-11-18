// 인터넷 송출 E2E(서버가 상태의 원본): 호스트 PC · 리모컨(비로그인) · 보기. 데이터는 Lorem 더미만. 가사/키 출력 안 함.
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const server = await ensureServer('dev', 5179) // 개발 서버가 없으면 띄우고 끝나면 끈다
const BASE = 'http://localhost:5179'

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch { /* retry */ } await sleep(250) }
  return false
}
const email = `e2e-${randomBytes(4).toString('hex')}@example.test`
const password = randomBytes(12).toString('base64url')
let userId, code, browser
const lorem = (t) => ['Lorem ipsum dolor', 'Sed do eiusmod', 'Ut enim ad minim', 'Duis aute irure'].map((s) => `${s}\n${t}`)
const seed = () => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: ['Lorem A', 'Ipsum B', 'Dolor C'].map((t, i) => ({ key: 'k' + i, songId: 'dummy-' + i, title: t, slides: lorem(t) })),
})

try {
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })
  if (u.error) throw new Error('임시 계정 생성 실패: ' + u.error.message)
  userId = u.data.user.id
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] })
  const mk = async (label, w, h, ctx) => {
    ctx ??= await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport({ width: w, height: h })
    p.on('pageerror', (e) => errors.push(`${label}: ${String(e.message).slice(0, 160)}`))
    p.on('dialog', (d) => d.accept())
    return p
  }
  const hostCtx = await browser.createBrowserContext()
  let host = await mk('host', 1400, 900, hostCtx)
  const remote = await mk('remote', 390, 844)
  const viewer = await mk('viewer', 390, 844)
  const text = (p, sel) => p.$eval(sel, (e) => e.textContent ?? '').catch(() => '')
  const pgm = (p = host) => text(p, '.bar.pgm span')
  const viewerCur = async () => `${await text(viewer, 'header strong')}|${(await text(viewer, '.slide.cur')).split('\n')[0]}`

  // ── 홈: 로컬/인터넷 구분, 인터넷 채널 만들기(그때 로그인) ──
  await host.goto(BASE + '/', { waitUntil: 'networkidle0' })
  check('홈: 로컬 송출이 첫 번째(예배용 기본)', (await text(host, 'main section h2')).startsWith('로컬 송출'))
  await host.locator('::-p-text(＋ 인터넷 송출 채널 만들기)').click()
  await host.waitForSelector('input[name=username]', { timeout: 5000 })
  await host.type('input[name=username]', email)
  await host.type('input[name=password]', password)
  await host.locator('form.login button').click()
  await host.waitForSelector('input[placeholder^="채널 제목 ("]', { timeout: 10000 })
  await host.type('input[placeholder^="채널 제목 ("]', 'Lorem 채널')
  await host.type('input[placeholder^="컨트롤 비밀번호"]', 'ctlpass1')
  await host.locator('::-p-text(채널 만들기)').click()
  await host.waitForFunction(() => /\/control\/[A-Z2-9]{6}$/.test(location.pathname), { timeout: 15000 })
  code = host.url().split('/').pop()
  check('호스트 화면 + 서버 연결', !!(await host.$('aside.side .set-wrap')) && await until(() => host.$('button.share.live')))

  // 콘티(Lorem) → 로그아웃(저장된 로그인 지움) + 새로고침 → 호스트 토큰만으로 호스트 유지 + 서버에 올라감
  await host.evaluate((c, s) => {
    localStorage.setItem('biew.live.v1:' + c, JSON.stringify(s))
    for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token$/.test(k)) localStorage.removeItem(k)
  }, code, seed())
  await host.reload({ waitUntil: 'networkidle0' })
  check('로그아웃 상태 새로고침에도 호스트 + 서버 연결', !!(await host.$('aside.side .set-wrap')) && await until(() => host.$('button.share.live')))
  const serverState = async () => (await admin.from('channels').select('state').eq('code', code).single()).data?.state
  check('PC 콘티가 서버(원본)에 올라감', await until(async () => (await serverState())?.setlist?.length === 3))

  // ── 리모컨: 폰별 잠금 ──
  await remote.goto(`${BASE}/control/${code}`, { waitUntil: 'networkidle0' })
  await remote.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 10000 })
  for (let i = 0; i < 5; i++) {
    await remote.$eval('input[placeholder="컨트롤 비밀번호"]', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) })
    await remote.type('input[placeholder="컨트롤 비밀번호"]', 'wrong-' + i)
    await remote.keyboard.press('Enter')
    await until(async () => (await text(remote, '.err')).length > 0, 5000)
    await sleep(300)
  }
  check('5번 틀린 폰은 잠김', (await text(remote, '.err')).includes('시도가 너무 많습니다'))
  const phone2 = await mk('phone2', 390, 844)
  await phone2.goto(`${BASE}/control/${code}`, { waitUntil: 'networkidle0' })
  await phone2.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 10000 })
  await phone2.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await phone2.keyboard.press('Enter')
  check('다른 폰은 잠기지 않고 입장', !!(await phone2.waitForSelector('.control.remote', { timeout: 10000 }).catch(() => null)))
  await phone2.close()
  // 잠긴 폰: 잠금 해제(1분) 대신 기록을 지우고 진행
  await remote.evaluate((c) => localStorage.removeItem('biew.lock.control.' + c), code)
  await remote.$eval('input[placeholder="컨트롤 비밀번호"]', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) })
  await remote.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await remote.keyboard.press('Enter')
  check('리모컨 입장 + 서버 상태 표시(곡 3개)', !!(await remote.waitForSelector('.control.remote', { timeout: 10000 }).catch(() => null)) && await until(async () => (await remote.$$('.song')).length === 3))

  // ── 리모컨 조작 → 서버 적용 → PC·보기 ──
  await viewer.goto(`${BASE}/view/${code}`, { waitUntil: 'networkidle0' })
  check('보기: 서버에서 현재 상태', await until(async () => (await viewerCur()) === 'Lorem A|Lorem ipsum dolor'))
  await remote.click('button[title^="다음"]')
  check('리모컨 ▶ → PC 따라감(Lorem A 2/4)', await until(async () => (await pgm()).includes('Lorem A · 2/4')))
  check('리모컨 ▶ → 보기 따라감', await until(async () => (await viewerCur()) === 'Lorem A|Sed do eiusmod'))
  await remote.click('.song[data-item="1"] .card')
  check('리모컨 점프 → PC Ipsum B 1/4', await until(async () => (await pgm()).includes('Ipsum B · 1/4')))

  // ── FREEZE(PC) 중 리모컨 ▶: 송출 고정 ──
  await host.bringToFront()
  await host.click('button.freeze')
  await sleep(800)
  await remote.click('button[title^="다음"]')
  await sleep(2000)
  check('FREEZE 중 리모컨 ▶ → PC 송출(PGM) 고정', (await pgm()).includes('Ipsum B · 1/4'))
  check('FREEZE 중 보기도 고정', (await viewerCur()) === 'Ipsum B|Lorem ipsum dolor')
  await host.bringToFront()
  await host.click('button.freeze')
  check('FREEZE 해제 → 컨트롤러 위치(Ipsum B 2/4) 송출', await until(async () => (await pgm()).includes('Ipsum B · 2/4')))
  check('해제 후 보기도 따라감', await until(async () => (await viewerCur()) === 'Ipsum B|Sed do eiusmod'))

  // ── PC 꺼짐: 리모컨·보기는 서버로 계속 ──
  await host.close()
  await remote.click('button[title^="다음"]')
  check('PC 꺼져도 리모컨 ▶ → 보기 따라감(서버가 원본)', await until(async () => (await viewerCur()) === 'Ipsum B|Ut enim ad minim'))
  host = await mk('host2', 1400, 900, hostCtx)
  await host.goto(`${BASE}/control/${code}`, { waitUntil: 'networkidle0' })
  check('PC 다시 켜면 서버 상태(Ipsum B 3/4)를 이어받음', await until(async () => (await pgm()).includes('Ipsum B · 3/4')))

  // ── PC 인터넷 끊김: PC 송출 계속 → 다시 연결되면 PC 기준 ──
  await until(() => host.$('button.share.live'))
  await host.setOfflineMode(true)
  await host.evaluate(() => window.dispatchEvent(new Event('offline')))
  await host.click('button[title^="다음"]')
  check('끊긴 동안 PC 송출 계속(Ipsum B 4/4)', await until(async () => (await pgm()).includes('Ipsum B · 4/4')))
  check('끊김 경고 표시', await until(async () => (await text(host, '.netwarn')).includes('인터넷 끊김')))
  await host.click('button[title^="다음"]')
  await until(async () => (await pgm()).includes('Dolor C · 1/4'))
  await host.setOfflineMode(false)
  await host.evaluate(() => window.dispatchEvent(new Event('online')))
  check('다시 연결 → PC 기준으로 서버·보기 맞춤(Dolor C 1/4)', await until(async () => (await viewerCur()) === 'Dolor C|Lorem ipsum dolor', 20000))
  check('경고 사라짐', await until(async () => !(await host.$('.netwarn'))))

  // ── 리모컨 → 프로젝터(PGM) 반영 시간(실제 브라우저) ──
  {
    await remote.bringToFront()
    const times = []
    for (let i = 0; i < 6; i++) {
      const before = await pgm()
      const t0 = Date.now()
      await remote.click(i % 2 ? 'button[title^="이전"]' : 'button[title^="다음"]')
      if (await until(async () => (await pgm()) !== before, 5000)) times.push(Date.now() - t0)
      await sleep(400)
    }
    times.sort((a, b) => a - b)
    console.log(`  · 리모컨 누름 → PC 송출(PGM) 반영: 중앙값 ${times[Math.floor(times.length / 2)]}ms, 최악 ${times.at(-1)}ms (${times.length}회)`)
    check('리모컨 → PC 송출 반영이 0.5초 이내(중앙값)', times.length === 6 && times[3] <= 500, JSON.stringify(times))
  }

  // ── 이 PC 에서 리모컨 쫓아내기(그때 로그인) → 리모컨만 막힘, PC·보기 그대로 ──
  await host.bringToFront()
  await host.click('button.share')
  await host.locator('::-p-text(관리 (리모컨 쫓아내기)').click()
  // 공용 로그인 팝업(📡 위에 겹쳐 뜸)
  await host.locator('::-p-text(관리하려면 로그인)').click()
  await host.waitForSelector('.login-dlg input[name=username]', { timeout: 5000 })
  await host.type('.login-dlg input[name=username]', email)
  await host.type('.login-dlg input[name=password]', password)
  await host.click('.login-dlg form.login button')
  await host.waitForSelector('input[placeholder^="새 컨트롤 비밀번호"]', { timeout: 10000 })
  await host.type('input[placeholder^="새 컨트롤 비밀번호"]', 'ctlpass2')
  await host.locator('::-p-text(비밀번호 바꾸고 리모컨 쫓아내기)').click()
  check('쫓아내기 완료 + PC 는 계속 연결', await until(async () => (await text(host, '.pop')).includes('쫓아냈습니다')) && await until(() => host.$('button.share.live')))
  await remote.bringToFront()
  await remote.click('button[title^="다음"]')
  check('리모컨은 다음 조작에서 막혀 비밀번호 화면으로', !!(await remote.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 15000 }).catch(() => null)))
  await remote.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await remote.keyboard.press('Enter')
  check('옛 비밀번호로는 못 들어옴', await until(async () => (await text(remote, '.err')).includes('맞지 않습니다'), 8000))
  await remote.$eval('input[placeholder="컨트롤 비밀번호"]', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) })
  await remote.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass2')
  await remote.keyboard.press('Enter')
  await remote.waitForSelector('.control.remote', { timeout: 10000 })
  const beforeKick = await pgm()
  await remote.click('button[title^="다음"]')
  check('새 비밀번호로 들어온 리모컨 → PC 따라감(새 주소)', await until(async () => (await pgm()) !== beforeKick))
  check('보기 기기는 그대로 실시간(주소 안 바뀜)', await until(async () => (await viewerCur()).startsWith((await pgm()).split(' · ')[0])))

  // ── 다른 기기(로그인)에서 쫓아내기 → 방송실 PC 는 30초 안에 새 주소로 ──
  {
    const other = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    await other.auth.signInWithPassword({ email, password })
    const k = await other.rpc('kick_remotes', { p_code: code, p_new_control_password: 'ctlpass3' })
    check('다른 기기에서 쫓아내기', !k.error, k.error?.message)
    await remote.bringToFront()
    await remote.click('button[title^="다음"]')
    await remote.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 15000 })
    await remote.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass3')
    await remote.keyboard.press('Enter')
    await remote.waitForSelector('.control.remote', { timeout: 10000 })
    // 실제 방송실처럼 컨트롤러 창을 앞에 둔다(가려진 탭은 브라우저가 타이머를 늦춤)
    await host.bringToFront()
    console.log('  · 방송실 PC 탭 보임 상태:', await host.evaluate(() => document.visibilityState))
    const t0 = Date.now()
    let followed = false
    while (Date.now() - t0 < 40000 && !followed) {
      const b = await pgm()
      await remote.evaluate(() => document.querySelector('button[title^="다음"]')?.click())
      followed = await until(async () => (await pgm()) !== b, 3000)
      if (!followed) await sleep(2000)
    }
    console.log('  · 따라오기까지', Math.round((Date.now() - t0) / 1000) + '초')
    check('방송실 PC 가 다시 로그인 없이 새 주소로 따라옴(10초 확인)', followed, `${Math.round((Date.now() - t0) / 1000)}초`)
    check('방송실 PC 에 권한 만료 경고 없음', !(await text(host, '.netwarn')).includes('권한 만료'))
  }

  // ── 삭제 ──
  await host.locator('::-p-text(채널 삭제)').click()
  check('삭제 → 홈', await host.waitForFunction(() => location.pathname === '/', { timeout: 10000 }).then(() => true).catch(() => false))
  await viewer.reload({ waitUntil: 'networkidle0' })
  check('삭제 후 보기 → 채널 없음', await until(async () => (await text(viewer, 'main')).includes('찾을 수 없습니다')))
  code = undefined
} catch (e) {
  fail++
  console.error('✖ 중단:', e.message)
} finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  const uniq = [...new Set(errors)]
  if (uniq.length) { console.log('\n페이지 오류:'); uniq.slice(0, 15).forEach((e) => console.log('  ' + e)) }
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
