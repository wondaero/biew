// 선곡 기록 E2E(인터넷 송출 채널 — 서버 channel_history). 운영 Supabase 에 임시 계정·Lorem 채널(끝나면 삭제 — 기록도 함께 지워짐).
// 서버에 저장 · 그림 묶음은 빼고 개수만 · 리모컨·보기 토큰으론 기록 못 봄 · 인터넷 끊김 → 이 PC 에 보관 → 다시 연결되면 올림 ·
// 자동 기록 없음 · [저장] 덮어쓰기 · [다른 이름으로 저장] · [불러오기] · 채널 삭제 시 기록도 삭제(2026-11-26)
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

  // 자동 기록 없음(2026-11-26) — 지난 날짜 선곡이 남아 있어도 서버에 아무것도 안 생김
  await sleep(4000)
  check('열어도 자동 기록 없음', (await serverRows()).length === 0)

  // [저장](연결 없음) → 새 기록 — 그림 묶음은 빼고 개수만
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  await p.$eval('.hi .save input', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); await p.type('.hi .save input', 'Lorem 첫 저장')
  await p.click('.hi .save-btn')
  check('[저장] → 서버에 새 기록', await until(async () => (await serverRows()).length === 1, 10000))
  const rows = await serverRows()
  check('서버 기록엔 그림 빼고 개수만(곡 1 · 그림 1묶음 빠짐)', rows[0]?.setlist.length === 1 && rows[0]?.skipped_media === 1 && rows[0]?.title === 'Lorem 첫 저장', JSON.stringify(rows.map((r) => ({ t: r.title, n: r.setlist.length, m: r.skipped_media }))))
  check('기록 창: 목록 + "그림 1묶음 빠짐" + 지금 선곡 연결', await until(async () => (await p.$$('.hi .list > li')).length === 1 && (await p.$eval('.hi .list', (e) => e.textContent)).includes('그림 1묶음 빠짐') && (await p.$eval('.hi .cur-info', (e) => e.textContent)).includes('Lorem 첫 저장')))

  // 리모컨·보기 토큰으로는 기록 못 봄 · 덮어쓰기도 못 함
  const j = (await anon.rpc('join_control', { p_code: code, p_password: 'ctlpass1' })).data?.[0]
  const asRemote = (await anon.rpc('host_history_list', { p_code: code, p_token: j?.token })).data?.[0]?.status
  check('리모컨 토큰으로 기록 목록 → 거부', asRemote === 'token_rejected', asRemote)
  const firstId = (await admin.from('channel_history').select('id').eq('code', code)).data?.[0]?.id
  const upd = (await anon.rpc('host_history_update', { p_code: code, p_token: j?.token, p_id: firstId, p_setlist: [], p_fingerprint: 'x', p_skipped: 0 })).data
  check('리모컨 토큰으로 덮어쓰기 → 거부', upd === 'token_rejected', String(upd))
  const direct = await anon.from('channel_history').select('id').eq('code', code)
  check('표 직접 읽기 → 아무것도 안 보임(RLS)', !direct.data?.length)

  // 선곡을 비우면 [저장] 꺼짐 → 기록 [불러오기]로 다시 채움(송출 대기)
  await p.keyboard.press('Escape')
  await p.$$eval('.setlist .items li .x', (bs) => bs.at(-1).click())
  await sleep(300)
  await p.$$eval('.setlist .items li .x', (bs) => bs.at(0).click())
  await sleep(300)
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  check('빈 선곡이면 [저장] 꺼짐', await p.$eval('.hi .save-btn', (e) => e.disabled))
  await until(async () => (await p.$$('.hi .list > li')).length === 1)
  await p.$$eval('.hi .list > li .info', (bs) => bs[0]?.click())
  await until(async () => (await p.$$('.hi .list > li.open .songs li')).length === 1)
  await p.click('.hi .list > li.open .load-row .primary')
  const st = async () => (await admin.from('channels').select('state').eq('code', code).single()).data?.state
  check('서버 기록 [불러오기] → 선곡 1곡, 송출 대기(서버 상태에도)', await until(async () => { const s = await st(); return s?.setlist?.length === 1 && s?.slideIndex === -1 && s?.blank === false }, 10000))

  // [다른 이름으로 저장](같은 내용이어도 새로) → [저장](그 기록에 덮어쓰기)
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  await p.$eval('.hi .save input', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); await p.type('.hi .save input', 'Lorem 둘째')
  await p.click('.hi .save-as')
  check('[다른 이름으로 저장] → 서버 기록 2개(같은 내용이어도)', await until(async () => (await serverRows()).length === 2, 10000))
  await sleep(300)
  await p.click('.hi .save-btn')
  check('[저장] → 연결된 서버 기록에 덮어쓰기(개수 그대로)', await until(async () => (await p.$eval('.hi .msg', (e) => e.textContent).catch(() => '')).includes('"Lorem 둘째" 에 저장'), 10000) && (await serverRows()).length === 2)

  // 인터넷 끊김 → [다른 이름으로 저장]은 이 PC 에 보관 → 다시 연결되면 올림, 연결도 서버 기록으로 옮김
  await p.keyboard.press('Escape')
  await p.setOfflineMode(true)
  await p.evaluate(() => window.dispatchEvent(new Event('offline')))
  await p.click('.setlist .hist'); await p.waitForSelector('.hi')
  await p.$eval('.hi .save input', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) }); await p.type('.hi .save input', 'Lorem 오프라인')
  await p.click('.hi .save-as')
  check('인터넷 끊김 → "이 PC 에 보관"', await until(async () => (await p.$eval('.hi .msg', (e) => e.textContent)).includes('이 PC 에 보관')))
  check('목록에 "이 PC 에 보관 중" 표시', await until(async () => (await p.$eval('.hi .list', (e) => e.textContent).catch(() => '')).includes('이 PC 에 보관 중')))
  await p.keyboard.press('Escape')
  await p.setOfflineMode(false)
  await p.evaluate(() => window.dispatchEvent(new Event('online')))
  check('다시 연결 → 보관해 둔 기록을 서버로 올림', await until(async () => (await serverRows()).some((r) => r.title === 'Lorem 오프라인'), 30000), JSON.stringify((await serverRows()).map((r) => r.title)))
  const offId = (await admin.from('channel_history').select('id').eq('code', code).eq('title', 'Lorem 오프라인')).data?.[0]?.id
  check('올린 뒤 연결도 서버 기록으로 옮겨짐', await until(async () => (await p.evaluate((c) => JSON.parse(localStorage.getItem('biew.historyLink.' + c) ?? 'null')?.id, code)) === offId))

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
