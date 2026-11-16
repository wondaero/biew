/**
 * 스태프 계정 생성 (공개 가입이 꺼져 있으므로 관리자 권한으로만 생성)
 *   npm run staff -- <이메일>
 * 비밀번호는 화면에 표시되지 않게 입력받는다. 비워 두면 강한 비밀번호를 생성해 한 번만 보여준다.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

process.loadEnvFile()
const email = process.argv[2]
if (!email || !email.includes('@')) {
  console.error('usage: npm run staff -- <이메일>')
  process.exit(1)
}

function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    stdout.write(q)
    let buf = ''
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); return resolve(buf) }
        if (c === '\u0003') process.exit(130)
        if (c === '\u007f') buf = buf.slice(0, -1)
        else buf += c
      }
    }
    stdin.on('data', onData)
  })
}

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('.env 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

let pw = await askHidden('비밀번호 (비우면 자동 생성, 8자 이상): ')
let generated = false
if (!pw) { pw = randomBytes(12).toString('base64url'); generated = true }
else {
  if (pw.length < 8) { console.error('8자 이상으로 입력하세요.'); process.exit(1) }
  if ((await askHidden('비밀번호 확인: ')) !== pw) { console.error('비밀번호가 일치하지 않습니다.'); process.exit(1) }
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: { role: 'staff' } })
if (error) { console.error('✖ 생성 실패:', error.message); process.exit(1) }
console.log(`✔ 스태프 계정 생성: ${data.user.email}`)
if (generated) console.log(`  생성된 비밀번호(지금 한 번만 표시): ${pw}`)
