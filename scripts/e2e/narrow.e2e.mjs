// 좁은 폰(280px) E2E: 화면마다 가로로 넘치는 요소가 없는지 + 스크린샷(out/e2e/w280-*.png).
// 홈 · 로컬 송출(시트 3종·곡 편집기·인터넷 송출 전환) · 보기(가사 목록) · 리모컨(비밀번호·화면). 임시 계정·Lorem 채널, 끝나면 삭제.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, OUT, ensureServer } from './_lib.mjs'
const W = Number(process.env.NARROW_W ?? 280)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PHONE = 'Mozilla/5.0 (Linux; Android 14; SM-F946N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const lorem = (t) => ['Lorem ipsum dolor sit amet\nconsectetur adipiscing elit', 'Sed do eiusmod tempor\nincididunt ut labore'].map((s) => `${s}\n${t}`)
const seed = () => ({
  version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: ['Lorem ipsum dolor sit amet A', 'Ipsum B'].map((t, i) => ({ key: 'k' + i, songId: 'dummy-' + i, title: t, slides: lorem(t) })),
})

/** 화면 안에서 오른쪽으로 넘치는 요소(보이는 것만, 가로 스크롤 상자 안은 제외) */
const overflow = (p) => p.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const out = []
  // 옆으로 넘기는 상자(가로 스크롤만 — 곡 편집기 미리보기 줄 등) 안은 예외. 'hidden' 은 예외 아님 — 잘려서 안 보이는 것도 문제(겪음: FREEZE 버튼)
  const sideScroller = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if ((c.overflowX === 'auto' || c.overflowX === 'scroll') && c.overflowY !== 'auto' && c.overflowY !== 'scroll') return true } return false }
  // 세로로 스크롤되는 상자(바텀시트·팝업 본문) 안이면 그 상자 안쪽(여백 제외)의 오른쪽 끝이 기준 — 시트 안에서 넘쳐도 잡히게(겪음: 저장 줄)
  const boxRight = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.overflowY === 'auto' || c.overflowY === 'scroll') { const r = a.getBoundingClientRect(); return r.left + a.clientLeft + a.clientWidth - parseFloat(c.paddingRight) } } return vw }
  // 음수 여백으로 일부러 가장자리까지 꽉 채운 요소(곡 제목 줄·시트 머리)와 그 안은 예외 — 화면(vw) 밖으로 나가는 건 여전히 잡힌다
  const bleed = (el) => {
    if (el.getBoundingClientRect().right > vw + 1) return false
    for (let a = el; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a); if (parseFloat(c.marginRight) < 0 || parseFloat(c.marginLeft) < 0) return true }
    return false
  }
  // 글이 길어 말줄임(…)으로 일부러 자른 요소는 예외
  const ellipsis = (el) => { for (let a = el; a; a = a.parentElement) { if (getComputedStyle(a).textOverflow === 'ellipsis') return true } return false }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue
    if (r.right > Math.min(vw, boxRight(el)) + 1 || r.left < -1) {
      if (sideScroller(el) || ellipsis(el) || bleed(el)) continue
      const name = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')
      out.push(`${name} [${Math.round(r.left)}~${Math.round(r.right)}] "${(el.textContent ?? '').trim().slice(0, 24)}"`)
    }
  }
  const page = document.documentElement.scrollWidth > vw + 1 ? [`페이지 가로 스크롤 ${document.documentElement.scrollWidth}px`] : []
  return [...page, ...out].slice(0, 8)
})
const audit = async (p, name) => {
  await sleep(400)
  await p.screenshot({ path: path.join(OUT, `w${W}-${name}.png`) })
  const o = await overflow(p)
  check(`${W}px ${name}: 넘침 없음`, o.length === 0, o.join('\n    '))
}

const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, code, browser
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  code = (await owner.rpc('create_channel', { p_title: 'Lorem ipsum 좁은 화면 확인용 채널 제목', p_control_password: 'ctlpass1' })).data
  await admin.from('channels').update({ state: seed() }).eq('code', code)

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const open = async () => {
    const p = await (await browser.createBrowserContext()).newPage()
    await p.setUserAgent(PHONE)
    await p.setViewport({ width: W, height: 653, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    p.on('dialog', (d) => d.dismiss())
    return p
  }

  // 홈
  const h = await open()
  await h.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await audit(h, 'home')
  await h.click('button.login-btn') // 로그인 칸
  await audit(h, 'home-login')

  // 로컬 송출
  const c = await open()
  await c.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await c.evaluate((s) => localStorage.setItem('biew.live.v1:LOCAL', JSON.stringify(s)), seed())
  await c.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await audit(c, 'local')
  // BLANK·FREEZE 켠 상태(글자가 길어지는 경우)
  await c.click('.group .blank'); await c.click('.group .freeze')
  await audit(c, 'local-blank-freeze')
  await c.click('.group .blank'); await c.click('.group .freeze')
  const dock = (i) => c.$$eval('.dock button', (bs, i) => bs[i].click(), i)
  const closeSheet = () => c.evaluate(() => history.back())
  await dock(0); await audit(c, 'sheet-search')
  await c.$$eval('.srch button.new', (bs) => bs[0].click()); await audit(c, 'song-editor')
  await closeSheet(); await sleep(300); await closeSheet(); await sleep(300)
  await dock(1); await audit(c, 'sheet-setlist'); await closeSheet(); await sleep(300)
  await dock(2); await audit(c, 'sheet-style')
  await c.$eval('.style-sheet', (e) => { e.scrollTop = e.scrollHeight }); await audit(c, 'sheet-style-bottom')
  await closeSheet(); await sleep(300)
  await c.$$eval('button', (bs) => bs.find((b) => b.textContent?.includes('인터넷 송출로 전환'))?.click())
  await audit(c, 'switch-dialog')

  // 보기(가사 목록)
  const v = await open()
  await v.goto(`${BASE}/view/${code}`, { waitUntil: 'networkidle0' })
  await v.waitForSelector('.viewer .slide', { timeout: 8000 }).catch(() => {})
  await audit(v, 'view')

  // 리모컨: 비밀번호 화면 → 화면
  const r = await open()
  await r.goto(`${BASE}/control/${code}`, { waitUntil: 'networkidle0' })
  await r.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 8000 })
  await audit(r, 'remote-password')
  await r.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await r.keyboard.press('Enter')
  await r.waitForSelector('.control.remote', { timeout: 8000 })
  await audit(r, 'remote')
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
