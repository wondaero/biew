// 선곡 기록 E2E(인터넷 송출 채널 — 서버 channel_history). 운영 Supabase 에 임시 계정·Lorem 채널(끝나면 삭제 — 기록도 함께 지워짐).
// 서버에 저장 · 그림 묶음은 빼고 개수만 · 리모컨·보기 토큰으론 기록 못 봄 · 인터넷 끊김 → 이 PC 에 보관 → 다시 연결되면 올림 ·
// 복사해서 시작 · 지난 날짜 선곡 자동 기록 · 채널 삭제 시 기록도 삭제
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CHROME, ensureServer } from './_lib.mjs'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const anon = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(200) } return false }

const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(11, 0, 0, 0)
const seed = () => ({
  version: yesterday.getTime(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
  setlist: [
    { key: 'k0', songId: 'd0', title: 'Lorem A', slides: ['Lorem ipsum'] },
    { key: 'km', songId: 'media', title: 'Lorem PDF', slides: ['biew-media:abcdef12'] },
  ],
})
const email = `hist-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, code, b
const serverRows = async () => (await admin.from('channel_history').select('title, skipped_media, setlist').eq('code', code).order('saved_at', { ascending: false })).data ?? []
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  code = (await owner.rpc('create_channel', { p_title: 'Lorem 주일', p_control_password: 'ctlpass1' })).data
  await admin.from('channels').update({ state: seed() }).eq('code', code)
  const g = (await owner.rpc('issue_host_token', { p_code: code })).data?.[0]

  b = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const p = await (await b.createBrowserContext()).newPage()
  p.on('dialog', (d) => d.accept())
  await p.setViewport({ width: 1400, height: 900 })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.evaluate((c, g) => localStorage.setItem('biew.host.' + c, JSON.stringify({ title: 'Lorem 주일', token: g.token, controlTopic: g.control_topic, viewTopic: g.view_topic, openedAt: new Date().toISOString() })), code, g)
  await p.goto(`${BASE}/${code}/control`, { waitUntil: 'networkidle0' })
  await p.waitForSelector('button.share.live', { timeout: 15000 })

  // 지난 날짜 선곡 자동 기록(열고 3초 뒤) — 그림 묶음은 빼고 개수만
  check('열 때 지난 날짜 선곡이 서버에 자동 기록', await until(async () => (await serverRows()).length === 1, 10000))
  let rows = await serverRows()
  check('서버 기록엔 그림 빼고 개수만(곡 1 · 그림 1묶음 빠짐)', rows[0]?.setlist.length === 1 && rows[0]?.skipped_media === 1 && rows[0]?.title.endsWith('Lorem 주일'), JSON.stringify(rows.map((r) => ({ t: r.title, n: r.setlist.length, m: r.skipped_media }))))

  // 리모컨·보기 토큰으로는 기록 못 봄
  const j = (await anon.rpc('join_control', { p_code: code, p_password: 'ctlpass1' })).data?.[0]
  const asRemote = (await anon.rpc('host_history_list', { p_code: code, p_token: j?.token })).data?.[0]?.status
  check('리모컨 토큰으로 기록 목록 → 거부', asRemote === 'token_rejected', asRemote)
  const direct = await anon.from('channel_history').select('id').eq('code', code)
  check('표 직접 읽기 → 아무것도 안 보임(RLS)', !direct.data?.length)

  // 화면: 목록 · 선곡 바꿔 기록
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  check('기록 창에 서버 기록 표시 + "그림 1묶음 빠짐"', await until(async () => (await p.$$('.hi .list li')).length === 1 && (await p.$eval('.hi .list', (e) => e.textContent)).includes('그림 1묶음 빠짐')))
  await p.keyboard.press('Escape')
  await p.$$eval('.setlist .items li .x', (bs) => bs.at(-1).click()) // 그림 빼기 → 선곡 Lorem A 만
  await sleep(500)
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  await p.click('.hi .save button')
  check('같은 선곡(그림 뺀 내용이 같음) → 건너뜀', await until(async () => (await p.$eval('.hi .msg', (e) => e.textContent)).includes('같은 선곡')))

  // 인터넷 끊김 → 이 PC 에 보관 → 다시 연결되면 올림
  await p.keyboard.press('Escape')
  await p.setOfflineMode(true)
  await p.evaluate(() => window.dispatchEvent(new Event('offline')))
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  await p.$eval('.hi .save input', (e) => { e.value = '' }); await p.type('.hi .save input', 'Lorem 오프라인')
  await admin.from('channel_history').delete().eq('code', code) // 같은 선곡이면 건너뛰므로(최근 기록과 비교) 서버 기록을 비우고 저장
  await p.click('.hi .save button')
  check('인터넷 끊김 → "이 PC 에 보관"', await until(async () => (await p.$eval('.hi .msg', (e) => e.textContent)).includes('이 PC 에 보관')))
  check('목록에 "이 PC 에 보관 중" 표시', await until(async () => (await p.$eval('.hi .list', (e) => e.textContent).catch(() => '')).includes('이 PC 에 보관 중')))
  await p.keyboard.press('Escape')
  await p.setOfflineMode(false)
  await p.evaluate(() => window.dispatchEvent(new Event('online')))
  check('다시 연결 → 보관해 둔 기록을 서버로 올림', await until(async () => (await serverRows()).some((r) => r.title === 'Lorem 오프라인'), 30000), JSON.stringify((await serverRows()).map((r) => r.title)))

  // 복사해서 시작(서버 기록)
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  await until(async () => (await p.$$('.hi .list li')).length >= 1)
  await p.$$eval('.hi .list li', (lis) => lis[0].querySelector('.acts .primary')?.click())
  const st = async () => (await admin.from('channels').select('state').eq('code', code).single()).data?.state
  check('서버 기록 복사해서 시작 → 선곡 1곡, 송출 대기(서버 상태에도)', await until(async () => { const s = await st(); return s?.setlist?.length === 1 && s?.slideIndex === -1 && s?.blank === false }, 10000))

  // 채널 삭제 → 기록도 삭제
  await admin.from('channels').delete().eq('code', code)
  check('채널 삭제 → 기록도 함께 삭제(cascade)', (await serverRows()).length === 0)
  code = null
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  await b?.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
