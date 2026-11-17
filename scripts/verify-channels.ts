/**
 * 채널 마이그레이션(supabase/migrations/20261117000000_channels.sql) 적용 후 검증.
 *   npm run verify:channels
 * .env 필요: SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * 임시 스태프 계정과 임시 채널(Lorem 더미)을 만들고, 끝나면 모두 삭제한다. 가사·실데이터는 건드리지 않는다.
 * 확인: RLS(남의 채널 안 보임), 비밀번호/토큰 흐름, 잠금, 접속 끊기, 보기 비밀번호 선택, 삭제.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

process.loadEnvFile()
const url = process.env.SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !service) throw new Error('.env 에 SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 필요')

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, service, opts)
const owner = createClient(url, anon, opts) // 로그인한 소유 계정
const guest = createClient(url, anon, opts) // 비로그인(폰/뷰어)

let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++; else fail++
  console.log(`${ok ? '✔' : '✖'} ${name}${!ok && detail ? `  — ${detail}` : ''}`)
}
const first = <T>(d: unknown) => (d as T[] | null)?.[0]
type J = { status: string; title: string | null; state: unknown; control_topic?: string; view_topic?: string; token?: string | null }
const rpc = async (c: SupabaseClient, fn: string, args: Record<string, unknown>) => c.rpc(fn, args)

const email = `verify-${randomBytes(4).toString('hex')}@example.test`
const password = randomBytes(12).toString('base64url')
const created: string[] = []
let userId: string | undefined

try {
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } })
  if (u.error) throw new Error(`임시 계정 생성 실패: ${u.error.message}`)
  userId = u.data.user.id
  const si = await owner.auth.signInWithPassword({ email, password })
  if (si.error) throw new Error(`로그인 실패: ${si.error.message}`)

  // ── 만들기 ──
  const short = await rpc(owner, 'create_channel', { p_title: 'Lorem', p_control_password: 'abc' })
  check('컨트롤 비밀번호 4자 미만은 거부', !!short.error)
  const noLogin = await rpc(guest, 'create_channel', { p_title: 'Lorem', p_control_password: 'abcd1234' })
  check('비로그인은 채널을 만들 수 없음', !!noLogin.error)

  const mk = await rpc(owner, 'create_channel', { p_title: 'Lorem ipsum', p_control_password: 'ctl-pass-1', p_view_password: 'view-pass-1' })
  const code = mk.data as string
  check('채널 생성(6자 코드)', !mk.error && /^[A-Z2-9]{6}$/.test(code ?? ''), mk.error?.message)
  if (!code) throw new Error('채널 생성 실패로 중단')
  created.push(code)
  const mk2 = await rpc(owner, 'create_channel', { p_title: 'Lorem open', p_control_password: 'ctl-pass-2' })
  const openCode = mk2.data as string
  created.push(openCode)
  const mk3 = await rpc(owner, 'create_channel', { p_title: 'Lorem lock', p_control_password: 'ctl-pass-3' })
  const lockCode = mk3.data as string
  created.push(lockCode)

  // ── RLS / 비밀 격리 ──
  const mine = await owner.from('channels').select('code,title,has_view_password')
  check('소유자는 자기 채널 목록을 봄', (mine.data ?? []).some((r: { code: string }) => r.code === code))
  check('has_view_password 표시', (mine.data ?? []).find((r: { code: string }) => r.code === code)?.has_view_password === true)
  const theirs = await guest.from('channels').select('code')
  check('비로그인은 channels 를 읽을 수 없음', !theirs.error ? (theirs.data ?? []).length === 0 : true)
  const sec = await owner.from('channel_secrets').select('*')
  check('소유자도 channel_secrets(해시/topic)를 직접 못 읽음', !!sec.error || (sec.data ?? []).length === 0)
  const sess = await guest.from('channel_sessions').select('*')
  check('channel_sessions 직접 접근 불가', !!sess.error || (sess.data ?? []).length === 0)
  const own = await owner.from('channels').update({ owner: '00000000-0000-0000-0000-000000000000' }).eq('code', code)
  check('소유자 변경(owner 컬럼 update) 거부', !!own.error)
  const guestUpd = await guest.from('channels').update({ title: 'hack' }).eq('code', code).select()
  check('비로그인은 channels 를 수정할 수 없음', !guestUpd.error ? (guestUpd.data ?? []).length === 0 : true)

  // ── 호스트 topic ──
  const tp = first<{ control_topic: string; view_topic: string }>((await rpc(owner, 'channel_topics', { p_code: code })).data)
  check('소유자는 topic 을 받음', !!tp?.control_topic && !!tp?.view_topic && tp.control_topic !== tp.view_topic)
  const tpGuest = first((await rpc(guest, 'channel_topics', { p_code: code })).data)
  check('비로그인은 topic 을 못 받음', !tpGuest)

  // ── 컨트롤 입장 ──
  const g = async (args: Record<string, unknown>) => first<J>((await rpc(guest, 'join_control', { p_code: code, ...args })).data)
  check('없는 번호 → not_found', (first<J>((await rpc(guest, 'join_control', { p_code: 'ZZZZZZ' })).data))?.status === 'not_found')
  check('비밀번호 없이 → password_required (상태/토픽 노출 없음)', await g({}).then((r) => r?.status === 'password_required' && !r.state && !r.control_topic))
  check('틀린 비밀번호 → bad_password', (await g({ p_password: 'nope' }))?.status === 'bad_password')
  const ok = await g({ p_password: 'ctl-pass-1' })
  check('맞는 비밀번호 → ok + 토큰 + topic', ok?.status === 'ok' && !!ok.token && ok.control_topic === tp?.control_topic && ok.view_topic === tp?.view_topic)
  const viaToken = await g({ p_token: ok?.token })
  check('토큰만으로 재입장(비밀번호 불필요)', viaToken?.status === 'ok' && !viaToken.token)
  check('위조 토큰 → token_rejected', (await g({ p_token: 'deadbeef' }))?.status === 'token_rejected')
  check('보기 비밀번호로는 컨트롤 입장 불가', (await g({ p_password: 'view-pass-1' }))?.status === 'bad_password')

  // ── 보기 입장 ──
  const v = async (c: string, args: Record<string, unknown>) => first<J>((await rpc(guest, 'join_view', { p_code: c, ...args })).data)
  check('보기 비밀번호 있는 채널: 없이 → password_required', (await v(code, {}))?.status === 'password_required')
  check('컨트롤 비밀번호로는 보기 입장 불가', (await v(code, { p_password: 'ctl-pass-1' }))?.status === 'bad_password')
  const vok = await v(code, { p_password: 'view-pass-1' })
  check('보기 비밀번호 → ok + view topic, control topic 은 안 줌', vok?.status === 'ok' && vok.view_topic === tp?.view_topic && !('control_topic' in (vok ?? {})))
  check('보기 토큰 재입장', (await v(code, { p_token: vok?.token }))?.status === 'ok')
  check('보기 토큰은 컨트롤 입장에 못 씀', (await g({ p_token: vok?.token }))?.status === 'token_rejected')
  const open = await v(openCode, {})
  check('보기 비밀번호 없는 채널: 번호만으로 ok', open?.status === 'ok' && !!open.view_topic)

  // ── 상태 저장/전달 ──
  const st = { version: 1, origin: 'verify', setlist: [{ key: 'k', songId: 's', title: 'Lorem', slides: ['Lorem ipsum'] }], itemIndex: 0, slideIndex: 0, blank: false, frozen: null, style: {} }
  const up = await owner.from('channels').update({ state: st, version: 1, updated_at: new Date().toISOString() }).eq('code', code)
  check('소유자는 state 저장', !up.error, up.error?.message)
  const after = await v(code, { p_token: vok?.token })
  check('입장 시 최신 state 전달', JSON.stringify((after?.state as { origin?: string } | null)?.origin) === '"verify"')

  // ── 잠금(별도 채널) ──
  const lk = async (pw: string) => first<J>((await rpc(guest, 'join_control', { p_code: lockCode, p_password: pw })).data)
  for (let i = 0; i < 5; i++) await lk('wrong')
  check('5번 틀리면 잠김(맞는 비밀번호도 거부)', (await lk('ctl-pass-3'))?.status === 'locked')

  // ── 접속 끊기 ──
  const reset = first<{ control_topic: string; view_topic: string }>((await rpc(owner, 'reset_channel_access', { p_code: code, p_control_password: 'ctl-pass-9' })).data)
  check('접속 끊기: topic 재발급', !!reset && reset.control_topic !== tp?.control_topic && reset.view_topic !== tp?.view_topic)
  check('접속 끊기: 기존 컨트롤 토큰 거부', (await g({ p_token: ok?.token }))?.status === 'token_rejected')
  check('접속 끊기: 기존 보기 토큰 거부', (await v(code, { p_token: vok?.token }))?.status === 'token_rejected')
  check('비밀번호 변경: 새 비밀번호 ok / 옛 비밀번호 거부', (await g({ p_password: 'ctl-pass-9' }))?.status === 'ok' && (await g({ p_password: 'ctl-pass-1' }))?.status === 'bad_password')
  const noOwnerReset = await rpc(guest, 'reset_channel_access', { p_code: code })
  check('비로그인은 접속 끊기 불가', !!noOwnerReset.error)
  await rpc(owner, 'reset_channel_access', { p_code: code, p_remove_view_password: true })
  check('보기 비밀번호 제거 → 번호만으로 보기', (await v(code, {}))?.status === 'ok')

  // ── 삭제 ──
  const del = await owner.from('channels').delete().eq('code', code)
  check('소유자는 채널 삭제', !del.error)
  check('삭제 후 입장 → not_found', (await g({ p_password: 'ctl-pass-9' }))?.status === 'not_found')
  created.splice(created.indexOf(code), 1)
} catch (e) {
  fail++
  console.error('✖ 검증 중단:', (e as Error).message)
} finally {
  for (const c of created) await admin.from('channels').delete().eq('code', c)
  if (userId) await admin.auth.admin.deleteUser(userId)
  console.log(`\n${fail ? '✖' : '✔'} ${pass} 통과 / ${fail} 실패  (임시 계정·채널 정리 완료)`)
  process.exit(fail ? 1 : 0)
}
