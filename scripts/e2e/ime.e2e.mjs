// 한글 조합(IME) 중에도 곡 검색이 바로 갱신되는지. 곡은 Lorem 더미를 IndexedDB 에 심는다.
import puppeteer from 'puppeteer-core'
import { CHROME, ensureServer } from './_lib.mjs'
const server = await ensureServer('dev', 5179) // 개발 서버가 없으면 띄우고 끝나면 끈다
const BASE = 'http://localhost:5179'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✖'} ${n}${!ok && d ? `  — ${d}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: CHROME, headless: true })
try {
  const p = await (await b.createBrowserContext()).newPage()
  await p.setViewport({ width: 1400, height: 900 })
  await p.goto(BASE + '/local', { waitUntil: 'networkidle0' })
  await p.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('biew')
    r.onsuccess = () => {
      const tx = r.result.transaction('songs', 'readwrite')
      const now = new Date().toISOString()
      ;['안개 Lorem', '안전 Ipsum', '평안 Dolor'].forEach((t, i) => tx.objectStore('songs').put({ id: 'dummy-' + i, title: t, slides: ['Lorem ipsum'], source_file: null, updated_at: now, deleted_at: null }))
      tx.oncomplete = () => res()
    }
    r.onerror = rej
  }))
  await p.reload({ waitUntil: 'networkidle0' })
  const hits = () => p.$$eval('ol.hits li', (l) => l.map((x) => x.textContent?.trim() ?? ''))
  await p.click('.side-actions .find') // 곡 목록 = 팝업
  await p.waitForSelector('input.search')
  await p.focus('input.search')
  const cdp = await p.createCDPSession()
  // '안' 확정 → '녀' 조합 중 → '녕' 조합 중(아직 확정 안 함)
  await cdp.send('Input.insertText', { text: '안' })
  await sleep(200)
  check("'안' → 곡 3개", (await hits()).length === 3, JSON.stringify(await hits()))
  await cdp.send('Input.imeSetComposition', { text: '녀', selectionStart: 1, selectionEnd: 1 })
  await cdp.send('Input.imeSetComposition', { text: '녕', selectionStart: 1, selectionEnd: 1 })
  await sleep(200)
  const during = await hits()
  check("'안녕' 조합 중(확정 전)에도 바로 '결과 없음'", during.length === 1 && during[0].includes('결과 없음'), JSON.stringify(during))
  await cdp.send('Input.insertText', { text: '녕' }) // 조합 확정
  await sleep(200)
  const after = await hits()
  check('확정 후에도 결과 없음', after.length === 1 && after[0].includes('결과 없음'), JSON.stringify(after))
} catch (e) { fail++; console.error('✖ 중단:', e.message) } finally {
  await b.close()
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패`)
  await server.stop()
  process.exit(fail ? 1 : 0)
}
