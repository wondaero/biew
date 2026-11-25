// 배포 후 문제 재현: (1) 옛 버전 창이 곡 저장소를 붙잡고 있을 때 (2) 새 버전 적용 뒤 옛 화면 파일이 없을 때
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { PROJ, CHROME } from './_lib.mjs'

const PORT = 5181, BASE = `http://localhost:${PORT}`
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { if (await fn()) return true } catch { /* retry */ } await sleep(200) }
  return false
}
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { cwd: PROJ, stdio: 'ignore' })
let browser
try {
  await until(async () => (await fetch(BASE + '/').catch(() => null))?.ok, 20000)
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
  const text = (p, sel) => p.$eval(sel, (e) => e.textContent ?? '').catch(() => '')

  // ── 1-a. 옛 버전 창(저장소 v1 을 열어 둔 채 닫지 않음) → 새 버전은 기다리며 안내 ──
  const ctx = await browser.createBrowserContext()
  const old = await ctx.newPage()
  await old.goto(BASE + '/manifest.webmanifest') // 같은 사이트, 앱은 안 뜨는 페이지
  await old.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('biew', 1) // 옛 앱처럼 v1 로 열고, 버전 변경 요청에 응답하지 않음
    r.onupgradeneeded = () => { r.result.createObjectStore('songs', { keyPath: 'id' }); r.result.createObjectStore('meta') }
    r.onsuccess = () => { window.__oldDb = r.result; res() }
    r.onerror = () => rej(r.error)
  }))
  const app = await ctx.newPage()
  await app.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  check('옛 창이 저장소를 붙잡으면 새 버전이 안내를 띄움', await until(async () => (await text(app, 'main')).includes('다른 Biew 창(옛 버전)')))
  await old.close() // 옛 창 닫기
  check('옛 창을 닫으면 자동으로 이어짐(안내 사라짐 + 곡 수 표시)', await until(async () => {
    const t = await text(app, 'main')
    return !t.includes('다른 Biew 창') && /\d+곡 저장됨/.test(t) && t.includes('아직 받지 않음')
  }))

  // ── 1-b. 이 창(앱 저장소 v4)이 더 새 버전(v5)의 업그레이드를 막지 않고 비켜 줌 ──
  const newer = await ctx.newPage()
  await newer.goto(BASE + '/manifest.webmanifest')
  const opened = await newer.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('biew', 5) // 앱 저장소는 v4(선곡 기록, src/library/db.ts) — 그보다 새 버전. 앱 저장소 버전을 올리면 여기도 +1
    r.onsuccess = () => { r.result.close(); res('ok') }
    r.onblocked = () => res('blocked')
    r.onerror = () => res('error')
    setTimeout(() => res('timeout'), 5000)
  }))
  check('더 새 버전이 열리면 이 창이 비켜 줌(업그레이드 안 막힘)', opened === 'ok', opened)
  check('이 창에는 "새로고침해 주세요" 안내', await until(async () => (await text(app, 'main')).includes('새 버전이 열렸습니다')))
  await ctx.close()

  // ── 2. 화면 파일을 한 번 못 받으면(새 버전 적용 뒤 옛 파일 삭제 상황) 자동 새로고침으로 복구 ──
  const ctx2 = await browser.createBrowserContext()
  const p = await ctx2.newPage()
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.setRequestInterception(true)
  let blocked = 0, reloaded = false
  p.on('load', () => { reloaded = true })
  p.on('request', (r) => {
    if (/\/assets\/HomeView-[^/]+\.js$/.test(r.url()) && !reloaded) { blocked++; r.abort() } else r.continue()
  })
  await p.evaluate(() => { window.__marker = 1 })
  await p.click('button.brand') // 홈으로 이동 → HomeView 파일 로드 실패
  check('화면 파일 로드 실패 → 그 주소로 자동 새로고침', await until(async () => (await p.evaluate(() => window.__marker === undefined && location.pathname === '/').catch(() => false))))
  check('새로고침 후 홈 화면 정상', await until(async () => (await text(p, 'h1')) === 'Biew'))
  check('파일이 계속 없어도 새로고침 한 번으로 복구(무한 새로고침 아님)', blocked >= 1 && blocked <= 2, 'blocked=' + blocked)
  await ctx2.close()
} catch (e) {
  fail++
  console.error('✖ 중단:', e.message)
} finally {
  await browser?.close()
  server.kill()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  process.exit(fail ? 1 : 0)
}
