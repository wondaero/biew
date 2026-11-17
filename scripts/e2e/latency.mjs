// 인터넷 송출 지연 측정: 리모컨 명령 왕복, 실시간 전달, 호스트 재조회. 임시 계정·Lorem 채널, 끝나면 삭제.
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const url = process.env.SUPABASE_URL, anon = process.env.VITE_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const owner = createClient(url, anon, opts)
const remote = createClient(url, anon, opts)
const viewer = createClient(url, anon, opts)
const first = (d) => d?.[0]
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return `중앙값 ${s[Math.floor(s.length / 2)]}ms · 최악 ${s.at(-1)}ms (${s.length}회)` }

const email = `lat-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(12).toString('base64url')
let userId, code
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id
  await owner.auth.signInWithPassword({ email, password })
  code = (await owner.rpc('create_channel', { p_title: 'Lorem latency', p_control_password: 'ctlpass1' })).data
  const host = first((await owner.rpc('issue_host_token', { p_code: code })).data)
  const slides = Array.from({ length: 40 }, (_, i) => `Lorem ipsum ${i}`)
  const st = { version: Date.now(), origin: 'pc', itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {},
    setlist: Array.from({ length: 8 }, (_, i) => ({ key: 'k' + i, songId: 's' + i, title: 'L' + i, slides })) }
  await owner.rpc('host_set_state', { p_code: code, p_token: host.token, p_state: st, p_force: true })
  const j = first((await remote.rpc('join_control', { p_code: code, p_password: 'ctlpass1' })).data)

  // 보기 기기: view 주소 구독
  let resolveMsg
  const ch = viewer.channel(`ch:${j.view_topic}`, { config: { broadcast: { self: false } } })
  ch.on('broadcast', { event: 'msg' }, () => resolveMsg?.(performance.now()))
  await new Promise((r) => ch.subscribe((s) => s === 'SUBSCRIBED' && r()))
  const rch = remote.channel(`ch:${j.view_topic}`, { config: { broadcast: { self: false, ack: false } } })
  await new Promise((r) => rch.subscribe((s) => s === 'SUBSCRIBED' && r()))

  const rpcMs = [], relayMs = [], toViewer = [], toHost = []
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now()
    const r = first((await remote.rpc('remote_command', { p_code: code, p_token: j.token, p_cmd: { cmd: i % 2 ? 'prev' : 'next' } })).data)
    const t1 = performance.now()
    rpcMs.push(Math.round(t1 - t0))
    const got = new Promise((res) => { resolveMsg = res })
    await rch.send({ type: 'broadcast', event: 'msg', payload: { type: 'state', state: r.state } })
    const t2 = await Promise.race([got, new Promise((res) => setTimeout(() => res(null), 3000))])
    if (t2) { relayMs.push(Math.round(t2 - t1)); toViewer.push(Math.round(t2 - t0)) }
    // 호스트: 알림을 받은 뒤 서버에서 다시 읽기(host_join)
    const t3 = performance.now()
    await viewer.rpc('host_join', { p_code: code, p_token: host.token })
    if (t2) toHost.push(Math.round(t2 - t0 + (performance.now() - t3)))
    await new Promise((r) => setTimeout(r, 200))
  }
  console.log('리모컨 명령 서버 왕복(remote_command):', stats(rpcMs))
  console.log('실시간 전달(폰→서버→다른 기기):', stats(relayMs))
  console.log('리모컨 누름 → 보기 기기 화면:', stats(toViewer))
  console.log('리모컨 누름 → PC 송출(재조회 포함, 대기 150ms 제외):', stats(toHost))
  await viewer.removeChannel(ch); await remote.removeChannel(rch)
} finally {
  if (code) await admin.from('channels').delete().eq('code', code)
  if (userId) await admin.auth.admin.deleteUser(userId)
  process.exit(0)
}
