// 그림 슬라이드 — 인터넷 송출 E2E: 호스트 PC 가 PDF 를 넣으면 서버(channel_media)에 올리고, 리모컨(작은 그림)·보기(큰 그림)가 받는다.
// 방송 중 추가분만 · 선곡에서 빼면 서버에서 바로 삭제 · 채널 삭제 = 함께 삭제. 더미 = 색 칠한 PDF(글 없음). 임시 계정·채널은 끝나면 삭제.
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { CHROME, OUT, ensureServer } from './_lib.mjs'

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, opts)
const server = await ensureServer('dev', 5179)
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `\n    ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch {} await sleep(300) } return false }

const DIR = path.join(OUT, 'media-fixture')
mkdirSync(DIR, { recursive: true })
function makePdf(file, colors) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${colors.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${colors.length} >>`]
  colors.forEach((c, i) => {
    const s = `${c} rg 0 0 960 540 re f 1 1 1 rg 40 40 200 100 re f`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents ${4 + i * 2} 0 R >>`, `<< /Length ${s.length} >>\nstream\n${s}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  writeFileSync(file, out, 'latin1')
}
const PDF1 = path.join(DIR, 'Lorem net.pdf'), PDF2 = path.join(DIR, 'Ipsum net.pdf')
makePdf(PDF1, ['1 0 0', '0 1 0', '0 0 1'])
makePdf(PDF2, ['1 1 0', '0 1 1'])

const email = `e2e-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, code, browser
const rows = async (key) => {
  let q = admin.from('channel_media').select('variant', { count: 'exact', head: true }).eq('code', code)
  if (key) q = q.eq('item_key', key)
  return (await q).count ?? -1
}
const centerColor = (p, sel) => p.$eval(sel, (img) => {
  if (!img.complete || !img.naturalWidth) return null
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const d = g.getImageData(c.width * 0.7 | 0, c.height * 0.6 | 0, 1, 1).data
  return [d[0], d[1], d[2]].map((v) => (v > 128 ? 1 : 0)).join('')
}).catch(() => null)
const loadedImgs = (p, sel) => p.$$eval(sel, (is) => is.filter((i) => i.complete && i.naturalWidth > 0).map((i) => i.naturalWidth))

try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  const mk = await owner.rpc('create_channel', { p_title: 'Lorem 그림 채널', p_control_password: 'ctlpass1', p_view_password: null })
  code = (Array.isArray(mk.data) ? mk.data[0]?.code : mk.data?.code) ?? mk.data
  if (typeof code !== 'string') throw new Error('채널 생성 실패: ' + (mk.error?.message ?? JSON.stringify(mk.data)))
  const grant = (await owner.rpc('issue_host_token', { p_code: code })).data?.[0]
  check('그림 없는 채널: 서버 channel_media 비어 있음', (await rows()) === 0)

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const host = await (await browser.createBrowserContext()).newPage()
  await host.setViewport({ width: 1400, height: 900 })
  host.on('dialog', (d) => d.accept())
  await host.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await host.evaluate((c, g) => {
    localStorage.setItem('biew.host.' + c, JSON.stringify({ title: g.title, token: g.token, controlTopic: g.control_topic, viewTopic: g.view_topic, openedAt: new Date().toISOString() }))
    localStorage.setItem('biew.live.v1:' + c, JSON.stringify({ version: Date.now(), origin: 'e2e', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {}, setlist: [{ key: 'k0', songId: 'd0', title: 'Lorem A', slides: ['Lorem ipsum', 'Dolor sit'] }] }))
  }, code, grant)
  await host.goto(`${BASE}/${code}/control`, { waitUntil: 'networkidle0' })
  check('호스트 PC 연결', await until(() => host.$('button.share.live')))
  await sleep(1500)
  check('가사만 있는 선곡: 서버에 그림 안 생김', (await rows()) === 0)

  const pick = async (file) => {
    await host.bringToFront()
    const [ch] = await Promise.all([host.waitForFileChooser(), host.click('.side-actions .mi-open')])
    await ch.accept([file])
  }
  await pick(PDF1)
  check('PDF 넣으면 서버에 작은 그림 3 + 큰 그림 3', await until(async () => (await rows()) === 6), `rows=${await rows()}`)
  check('호스트: 올리는 중 표시가 끝나면 사라짐', await until(async () => !(await host.$('.media-st'))))

  // 리모컨(폰, 다른 브라우저 = 그림 없음) — 작은 그림
  const remote = await (await browser.createBrowserContext()).newPage()
  await remote.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await remote.goto(`${BASE}/${code}/control`, { waitUntil: 'networkidle0' })
  await remote.waitForSelector('input[placeholder="컨트롤 비밀번호"]', { timeout: 10000 })
  await remote.type('input[placeholder="컨트롤 비밀번호"]', 'ctlpass1')
  await remote.keyboard.press('Enter')
  await remote.waitForSelector('.control.remote', { timeout: 10000 })
  check('리모컨: 카드 3장 그림 받음', await until(async () => (await loadedImgs(remote, '[data-item="1"] .card .thumb img')).length === 3))
  const rw = await loadedImgs(remote, '[data-item="1"] .card .thumb img')
  check('리모컨 = 작은 그림(폭 ≤ 480)', rw.every((w) => w <= 480), rw.join(','))
  const rStore = await remote.evaluate(() => new Promise((res) => { const r = indexedDB.open('biew'); r.onsuccess = () => { try { const g = r.result.transaction('media').objectStore('media').count(); g.onsuccess = () => res(g.result) } catch { res(0) } }; r.onerror = () => res(0) }))
  check('리모컨: 기기에 저장 안 함', rStore === 0, `stored=${rStore}`)

  // 보기(폰) — 큰 그림
  const viewer = await (await browser.createBrowserContext()).newPage()
  await viewer.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await viewer.goto(`${BASE}/${code}`, { waitUntil: 'networkidle0' })

  // 호스트가 그림 2장 송출 → 리모컨 모니터·보기 목록
  await host.bringToFront()
  await host.click('[data-item="1"] .cell:nth-child(2) .card')
  await remote.bringToFront()
  check('리모컨 송출 화면에 그 그림(초록)', await until(async () => (await centerColor(remote, '.side .screen.jump img')) === '010'))
  await viewer.bringToFront()
  check('보기: 송출 중인 그림 목록이 그림으로(3장)', await until(async () => (await loadedImgs(viewer, '.slide .pic img')).length === 3))
  const vw = await loadedImgs(viewer, '.slide .pic img')
  check('보기 = 큰 그림(폭 > 480)', vw.every((w) => w > 480), vw.join(','))
  await viewer.screenshot({ path: path.join(OUT, 'media-net-view.png') })

  // 방송 중 PDF 추가 → 추가분만 올리고 리모컨이 받음
  await pick(PDF2)
  check('추가 PDF: 서버 그림 6 → 10(추가분 2장 × 2)', await until(async () => (await rows()) === 10), `rows=${await rows()}`)
  await remote.bringToFront()
  check('리모컨: 추가된 곡의 그림도 받음', await until(async () => (await loadedImgs(remote, '[data-item="2"] .card .thumb img')).length === 2))
  await remote.screenshot({ path: path.join(OUT, 'media-net-remote.png') })

  // 선곡에서 빼면 서버에서 바로 삭제
  const key2 = await host.evaluate((c) => JSON.parse(localStorage.getItem('biew.live.v1:' + c)).setlist[2].key, code)
  await host.bringToFront()
  await host.click('.setlist li:nth-child(3) .x')
  check('선곡에서 빼면 그 항목 그림 바로 삭제(나머지 그대로)', await until(async () => (await rows(key2)) === 0 && (await rows()) === 6), `rows=${await rows()}`)

  // 채널 삭제 → 함께 삭제
  await owner.from('channels').delete().eq('code', code)
  check('채널 삭제 → 그림도 0', (await rows()) === 0)
  code = null
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await browser?.close()
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패 (임시 계정·채널 정리)`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
