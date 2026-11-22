// 리모컨 → PC 송출(PGM) 반영 지연을 실제 브라우저로 측정(검사 없음, 숫자만). 바뀐 순간을 PC 페이지 안에서 기록(MutationObserver).
// 운영 Supabase 에 임시 계정·Lorem 채널(끝나면 삭제). 사용: node scripts/e2e/latency-browser.mjs [횟수]
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const N = Number(process.argv[2] ?? 30)
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const email = `lat-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, code, browser
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  code = (await owner.rpc('create_channel', { p_title: 'Lorem latency', p_control_password: 'ctlpass1' })).data
  const slides = Array.from({ length: 40 }, (_, i) => `Lorem ipsum ${i}`)
  await admin.from('channels').update({ state: { version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
    setlist: Array.from({ length: 8 }, (_, i) => ({ key: 'k' + i, songId: 's' + i, title: 'L' + i, slides })) } }).eq('code', code)
  const g = (await owner.rpc('issue_host_token', { p_code: code })).data?.[0]
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const host = await (await browser.createBrowserContext()).newPage()
  await host.setViewport({ width: 1400, height: 900 })
  await host.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await host.evaluate((c, g) => localStorage.setItem('biew.host.' + c, JSON.stringify({ title: g.title, token: g.token, controlTopic: g.control_topic, viewTopic: g.view_topic, openedAt: new Date().toISOString() })), code, g)
  await host.goto(`${BASE}/${code}/control`, { waitUntil: 'networkidle0' })
  await host.waitForSelector('button.share.live', { timeout: 15000 })
  await host.evaluate(() => { window.__at = []; new MutationObserver(() => window.__at.push(Date.now())).observe(document.querySelector('.bar.pgm span'), { childList: true, characterData: true, subtree: true }) })
  const remote = await (await browser.createBrowserContext()).newPage()
  await remote.setViewport({ width: 390, height: 844 })
  await remote.goto(`${BASE}/${code}/control`, { waitUntil: 'networkidle0' })
  await remote.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1'); await remote.keyboard.press('Enter')
  await remote.waitForSelector('.control.remote', { timeout: 10000 })
  await sleep(1500)
  const times = []
  for (let i = 0; i < N; i++) {
    const t0 = Date.now()
    await remote.click(i % 2 ? 'button[title^="이전"]' : 'button[title^="다음"]')
    let at = 0
    for (let k = 0; k < 100 && !at; k++) { at = await host.evaluate((t) => window.__at.find((x) => x >= t) ?? 0, t0); if (!at) await sleep(20) }
    if (at) times.push(at - t0)
    await sleep(500)
  }
  const s = [...times].sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  console.log(`RESULT n=${s.length} 중앙값 ${q(0.5)}ms · 90% ${q(0.9)}ms · 최악 ${s.at(-1)}ms · 최소 ${s[0]}ms`)
} finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await browser?.close(); await server.stop()
}
