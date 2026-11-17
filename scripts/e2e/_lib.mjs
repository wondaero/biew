/**
 * 브라우저 E2E 공용 도우미(headless Chrome + puppeteer-core).
 *  - 프로젝트 경로는 이 파일 위치로 자동 계산, .env 자동 로드(서버 검증·임시 계정에 service_role 필요)
 *  - Chrome 경로: CHROME_PATH 환경변수 > OS 별 기본 설치 위치
 *  - ensureServer: 개발 서버(또는 미리보기 서버)가 그 포트에 떠 있으면 그대로 쓰고, 없으면 띄웠다가 stop() 으로 끈다
 *  - 결과물(스크린샷)은 out/e2e/ (git 제외)
 * 데이터 원칙: Lorem 더미만, 임시 스태프 계정·채널·곡은 끝나면 삭제(곡은 완전 삭제). 가사·키는 출력하지 않는다.
 */
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

export const PROJ = fileURLToPath(new URL('../..', import.meta.url))
export const OUT = path.join(PROJ, 'out', 'e2e')
mkdirSync(OUT, { recursive: true })

const envFile = path.join(PROJ, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  }[process.platform] ?? []
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('Chrome 을 찾지 못했습니다. CHROME_PATH 환경변수로 실행 파일 경로를 지정하세요.')
  return found
}
export const CHROME = findChrome()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alive = async (url) => !!(await fetch(url).catch(() => null))?.ok

/**
 * mode 'dev' = vite 개발 서버(서비스 워커 없음), 'preview' = 배포용 빌드(dist) 서버(서비스 워커 동작 — 먼저 npm run build).
 * 이미 떠 있으면 재사용(stop 은 아무것도 안 함).
 */
export async function ensureServer(mode, port) {
  const url = `http://localhost:${port}/`
  if (await alive(url)) return { url, stop: async () => {} }
  const args = mode === 'preview' ? ['preview', '--port', String(port), '--strictPort'] : ['--port', String(port), '--strictPort']
  const child = spawn(process.execPath, [path.join(PROJ, 'node_modules/vite/bin/vite.js'), ...args], { cwd: PROJ, stdio: 'ignore' })
  for (let i = 0; i < 100 && !(await alive(url)); i++) await sleep(200)
  if (!(await alive(url))) { child.kill(); throw new Error(`${mode} 서버를 띄우지 못했습니다(포트 ${port})`) }
  return {
    url,
    stop: async () => { child.kill(); for (let i = 0; i < 50 && (await alive(url)); i++) await sleep(200) },
  }
}
