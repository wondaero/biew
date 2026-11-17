/**
 * .env 만들기 — Supabase CLI 의 API 키 목록을 받아 키 값을 화면에 내지 않고 바로 .env 에 쓴다.
 *   npx supabase@2 login        (브라우저 인증, 처음 한 번)
 *   npx supabase@2 projects api-keys --project-ref bgfkodbfgjhsauwqhviq -o json | node scripts/make-env.mjs
 * 이미 .env 가 있으면 덮어쓰지 않는다. 출력은 '어떤 키를 썼는지'(이름·길이)만.
 *  - VITE_SUPABASE_ANON_KEY   = publishable 키(번들에 들어가도 되는 공개 키, Vercel 과 같음)
 *  - SUPABASE_SERVICE_ROLE_KEY = 레거시 service_role(새 secret 키는 CLI 가 가려서 줌). 스크립트 전용 — VITE_ 금지
 */
import fs from 'node:fs'

const URL = 'https://bgfkodbfgjhsauwqhviq.supabase.co'
let buf = ''
process.stdin.on('data', (d) => (buf += d))
process.stdin.on('end', () => {
  if (fs.existsSync('.env')) { console.log('.env 가 이미 있어 덮어쓰지 않습니다.'); process.exit(1) }
  const start = buf.indexOf('[')
  if (start < 0) { console.log('API 키 목록(JSON)을 받지 못했습니다. supabase login 을 먼저 하세요.'); process.exit(1) }
  const keys = JSON.parse(buf.slice(start))
  const pick = (pred) => keys.find(pred)
  const publishable = pick((k) => k.type === 'publishable') ?? pick((k) => k.name === 'anon')
  const service = pick((k) => k.name === 'service_role' && k.type === 'legacy') ?? pick((k) => k.name === 'service_role')
  const masked = (v) => !v || /[·•*]/.test(v)
  fs.writeFileSync('.env', [
    '# 클라이언트(번들에 포함됨) — anon/publishable 키만',
    `VITE_SUPABASE_URL=${URL}`,
    `VITE_SUPABASE_ANON_KEY=${publishable?.api_key ?? ''}`,
    '',
    '# 로컬 스크립트 전용 — VITE_ 접두사 금지 (번들 유출 방지)',
    `SUPABASE_URL=${URL}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service?.api_key ?? ''}`,
    '',
  ].join('\n'))
  const desc = (k) => (k ? `${k.name}/${k.type ?? '-'} (길이 ${k.api_key?.length ?? 0}${masked(k.api_key) ? ', 가려진 값 — 대시보드에서 직접 넣으세요' : ''})` : '없음')
  console.log('.env 생성')
  console.log('  VITE_SUPABASE_ANON_KEY   :', desc(publishable))
  console.log('  SUPABASE_SERVICE_ROLE_KEY:', desc(service))
})
