/**
 * 브라우저 E2E 전체 실행: 배포용 빌드 → 각 스크립트를 차례로 → 요약.
 *   npm run e2e
 * 실제 Supabase(운영 DB)를 쓴다 — 임시 계정·Lorem 채널·테스트 곡을 만들고 끝나면 지운다. .env(service_role) 필요.
 */
import { spawnSync } from 'node:child_process'
import { PROJ } from './_lib.mjs'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
// 셸은 Windows 의 npm.cmd 에만 — node 경로(C:\Program Files\…)는 셸을 거치면 띄어쓰기에서 잘려 실행되지 않는다(겪음)
const run = (cmd, args, shell = false) => spawnSync(cmd, args, { cwd: PROJ, stdio: 'inherit', shell })

console.log('▶ 배포용 빌드(오프라인·업그레이드 검증용)')
if (run(npm, ['run', 'build'], process.platform === 'win32').status !== 0) process.exit(1)

const suites = ['internet', 'local', 'home', 'routes', 'focus', 'device', 'delete', 'back', 'narrow', 'cards', 'slideedit', 'ui', 'sync', 'bg', 'presets', 'ime', 'offline', 'upgrade']
const results = []
for (const s of suites) {
  console.log(`\n▶ ${s}`)
  const r = run(process.execPath, [`scripts/e2e/${s}.e2e.mjs`])
  results.push([s, r.status === 0])
}
console.log('\n── 요약 ──')
for (const [s, ok] of results) console.log(`${ok ? '✔' : '✖'} ${s}`)
process.exit(results.every(([, ok]) => ok) ? 0 : 1)
