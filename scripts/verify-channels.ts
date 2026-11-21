/**
 * 채널 마이그레이션(supabase/migrations/2026111*_channel*.sql) 적용 후 검증.
 *   npm run verify:channels
 * .env 필요: SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * 임시 스태프 계정과 임시 채널(Lorem 더미)을 만들고, 끝나면 모두 삭제한다. 가사·실데이터는 건드리지 않는다.
 * 확인: RLS(남의 채널 안 보임), 비밀번호/토큰 흐름, 리모컨 쫓아내기·보기 비밀번호 변경(호스트 유지), 삭제,
 *       인터넷 송출 상태(호스트 토큰·상태 올리기·리모컨 명령·서버 실시간 알림), 서버 이동 규칙 = 앱(nav.ts) 대조.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import * as nav from '../src/live/nav'
import { emptyLiveState, type LiveState, type SetlistItem } from '../shared/types'

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
type J = { status: string; title: string | null; control_topic?: string; view_topic?: string; token?: string | null }
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
  check('채널 생성(숫자 6자리 코드)', !mk.error && /^[0-9]{6}$/.test(code ?? ''), mk.error?.message)
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
  const tp = first<{ control_topic: string; view_topic: string }>((await rpc(owner, 'issue_host_token', { p_code: code })).data)
  check('소유자는 호스트 주소(topic)를 받음', !!tp?.control_topic && !!tp?.view_topic && tp.control_topic !== tp.view_topic)
  check('비로그인은 호스트 주소를 못 받음', !!(await rpc(guest, 'issue_host_token', { p_code: code })).error)
  check('정리된 옛 DB 객체는 없음(rooms·get_room·channel_topics)', !!(await rpc(owner, 'get_room', { p_code: 'AAAAAA' })).error && !!(await rpc(owner, 'channel_topics', { p_code: code })).error && !!(await admin.from('rooms').select('code').limit(1)).error)

  // ── 컨트롤 입장 ──
  const g = async (args: Record<string, unknown>) => first<J>((await rpc(guest, 'join_control', { p_code: code, ...args })).data)
  check('없는 번호 → not_found', (first<J>((await rpc(guest, 'join_control', { p_code: 'ZZZZZZ' })).data))?.status === 'not_found')
  check('비밀번호 없이 → password_required (상태/토픽 노출 없음)', await g({}).then((r) => r?.status === 'password_required' && !r.control_topic && !r.token))
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

  // ── 공개 채널 목록(로그인 불필요) ──
  const pubList = await rpc(guest, 'list_public_channels', {})
  const pubCodes = ((pubList.data ?? []) as { code: string; title: string }[]).map((r) => r.code)
  check('공개 목록: 비로그인으로 조회 가능', !pubList.error, pubList.error?.message)
  check('공개 목록: 보기 비밀번호 있는 채널은 보임', pubCodes.includes(code))
  check('공개 목록: 보기 비밀번호 없는 채널은 안 보임', !pubCodes.includes(openCode) && !pubCodes.includes(lockCode))
  check('공개 목록: 비밀번호·주소·상태 미노출', !((pubList.data ?? []) as Record<string, unknown>[]).some((r) => 'view_topic' in r || 'state' in r || 'control_topic' in r))

  // ── 메타 수정 / 상태는 DB 에 없음 ──
  const rename = await owner.from('channels').update({ title: 'Lorem renamed', updated_at: new Date().toISOString() }).eq('code', code).select('title')
  check('소유자는 제목 수정 가능', !rename.error && rename.data?.[0]?.title === 'Lorem renamed', rename.error?.message)
  const hv = await owner.from('channels').update({ has_view_password: false }).eq('code', code)
  check('has_view_password 직접 변조 거부', !!hv.error)
  check('비밀번호 틀림 응답엔 상태(가사) 없음', !((await g({ p_password: 'nope' })) as { state?: unknown } | undefined)?.state)

  // ── 서버는 잠그지 않는다(폰별 잠금은 클라이언트에서) ──
  const lk = async (pw: string) => first<J>((await rpc(guest, 'join_control', { p_code: lockCode, p_password: pw })).data)
  for (let i = 0; i < 6; i++) await lk('wrong')
  check('여러 번 틀려도 서버는 다른 기기를 잠그지 않음', (await lk('ctl-pass-3'))?.status === 'ok')

  // ── 인터넷 송출: 호스트 토큰 · 상태 · 리모컨 명령 ──
  const seed = (v: number): LiveState => ({ ...emptyLiveState('pc-verify'), version: v, setlist: [
    { key: 'k0', songId: 's0', title: 'Lorem A', slides: ['Lorem 0', 'Lorem 1'] },
    { key: 'k1', songId: 's1', title: 'Lorem B', slides: [] },
    { key: 'k2', songId: 's2', title: 'Lorem C', slides: ['Lorem 2'] },
  ] })
  const hostTok = first<{ token: string }>((await rpc(owner, 'issue_host_token', { p_code: openCode })).data)?.token
  check('소유자는 호스트 토큰 발급', !!hostTok)
  check('비로그인은 호스트 토큰 발급 불가', !!(await rpc(guest, 'issue_host_token', { p_code: openCode })).error)
  const hj = async (tok?: string) => first<{ status: string; state: unknown }>((await rpc(guest, 'host_join', { p_code: openCode, p_token: tok ?? null })).data)
  check('호스트 토큰으로 입장(로그인 불필요)', (await hj(hostTok))?.status === 'ok')
  check('가짜 호스트 토큰 거부', (await hj('deadbeef'))?.status === 'token_rejected')
  const hs = async (st: LiveState, force = false, tok = hostTok) =>
    first<{ status: string; version: number }>((await rpc(guest, 'host_set_state', { p_code: openCode, p_token: tok, p_state: st, p_force: force })).data)
  const v0 = Date.now()
  check('호스트 상태 올리기', (await hs(seed(v0)))?.status === 'ok')
  check('더 오래된 상태는 stale(그 사이 바뀐 서버가 우선)', (await hs(seed(v0 - 1000)))?.status === 'stale')
  check('force(다시 연결된 PC 기준)는 덮어씀', (await hs(seed(v0 - 500), true))?.status === 'ok')
  check('리모컨 토큰으로는 호스트 상태를 못 씀', (await hs(seed(v0 + 1), false, ok?.token ?? 'x'))?.status === 'token_rejected')

  const ctlTok = first<J>((await rpc(guest, 'join_control', { p_code: openCode, p_password: 'ctl-pass-2' })).data)
    const rc = async (cmd: unknown, tok = ctlTok?.token) =>
    first<{ status: string; state: LiveState }>((await rpc(guest, 'remote_command', { p_code: openCode, p_token: tok, p_cmd: cmd })).data)
  const r1 = await rc({ cmd: 'next' })
  check('리모컨 ▶ → 서버가 적용(Lorem A 2번째 장)', r1?.status === 'ok' && r1.state.itemIndex === 0 && r1.state.slideIndex === 1)
  const r2 = await rc({ cmd: 'next' })
  check('리모컨 ▶ → 빈 곡 건너뛰고 다음 곡', r2?.status === 'ok' && r2.state.itemIndex === 2 && r2.state.slideIndex === 0)
  check('범위 밖 점프는 무시(noop)', (await rc({ cmd: 'go', itemIndex: 1, slideIndex: 0 }))?.status === 'noop')
  check('허용 안 된 명령(freeze·선곡 교체)은 무시', (await rc({ cmd: 'freeze' }))?.status === 'noop' && (await rc({ cmd: 'replace', setlist: [] }))?.status === 'noop')
  check('보기 토큰으로는 리모컨 명령 불가', (await rc({ cmd: 'next' }, vok?.token ?? 'x'))?.status === 'token_rejected')
  // 변경 알림은 변경한 클라이언트가 보낸다(DB 발 공개 알림은 전달되지 않음 — 20261118010000 참고)
  check('호스트는 리모컨이 바꾼 상태를 읽음', ((await hj(hostTok))?.state as LiveState)?.itemIndex === 2)

  // ── 서버 이동 규칙 = 앱(nav.ts) ──
  let seedN = 7
  const rnd = (n: number) => { seedN = (seedN * 1103515245 + 12345) & 0x7fffffff; return seedN % n }
  const tsApply = (st: LiveState, cmd: Record<string, unknown>) => {
    if (cmd.cmd === 'blank') return { ...st, blank: !st.blank }
    let cur: { itemIndex: number; slideIndex: number } | null = null
    if (cmd.cmd === 'go') {
      const i = cmd.itemIndex as number, j = cmd.slideIndex as number
      const ok = Number.isInteger(i) && Number.isInteger(j) && j >= 0 && j < (st.setlist[i]?.slides.length ?? 0)
      cur = ok ? { itemIndex: i, slideIndex: j } : null
    } else if (cmd.cmd === 'next' || cmd.cmd === 'prev' || cmd.cmd === 'nextSong' || cmd.cmd === 'prevSong') cur = nav[cmd.cmd](st)
    else return null
    return cur ? { ...st, ...cur, blank: false } : null
  }
  let mismatch = ''
  for (let t = 0; t < 120 && !mismatch; t++) {
    const setlist: SetlistItem[] = Array.from({ length: 1 + rnd(4) }, (_, i) => ({ key: 'k' + i, songId: 's' + i, title: 'L' + i, slides: Array.from({ length: rnd(4) }, (_, j) => 'Lorem ' + j) }))
    const itemIndex = rnd(setlist.length), slideIndex = rnd(Math.max(1, setlist[itemIndex]!.slides.length))
    const st: LiveState = { ...emptyLiveState('pc'), version: 1, setlist, itemIndex, slideIndex, blank: rnd(2) === 1 }
    const cmds: Record<string, unknown>[] = [{ cmd: 'next' }, { cmd: 'prev' }, { cmd: 'nextSong' }, { cmd: 'prevSong' }, { cmd: 'blank' }, { cmd: 'go', itemIndex: rnd(5) - 1, slideIndex: rnd(5) - 1 }]
    const cmd = cmds[rnd(cmds.length)]!
    const exp = tsApply(st, cmd)
    const { data, error } = await admin.rpc('_apply_command', { st, cmd })
    const act = data as LiveState | null
    const same = exp === null ? act === null : !!act && act.itemIndex === exp.itemIndex && act.slideIndex === exp.slideIndex && act.blank === exp.blank
    if (error || !same) mismatch = `${JSON.stringify(cmd)} @ ${itemIndex}/${slideIndex} lens=${setlist.map((x) => x.slides.length)} → 앱 ${exp ? exp.itemIndex + '/' + exp.slideIndex : 'null'} / 서버 ${act ? act.itemIndex + '/' + act.slideIndex : 'null'} ${error?.message ?? ''}`
  }
  check('서버 이동 규칙 = 앱 이동 규칙(무작위 120건 대조)', !mismatch, mismatch)

  // ── 리모컨 쫓아내기(컨트롤 비밀번호 변경) / 보기 비밀번호 변경 — 호스트 PC 는 유지 ──
  const hostTok2 = first<{ token: string }>((await rpc(owner, 'issue_host_token', { p_code: code })).data)?.token
  const hj2 = async () => first<{ status: string; control_topic: string; view_topic: string }>((await rpc(guest, 'host_join', { p_code: code, p_token: hostTok2 })).data)
  check('같은 비밀번호로는 쫓아내기 거부', !!(await rpc(owner, 'kick_remotes', { p_code: code, p_new_control_password: 'ctl-pass-1' })).error)
  check('짧은 새 비밀번호 거부', !!(await rpc(owner, 'kick_remotes', { p_code: code, p_new_control_password: 'abc' })).error)
  check('비로그인은 쫓아내기 불가', !!(await rpc(guest, 'kick_remotes', { p_code: code, p_new_control_password: 'ctl-pass-9' })).error)
  const kick = first<{ control_topic: string }>((await rpc(owner, 'kick_remotes', { p_code: code, p_new_control_password: 'ctl-pass-9' })).data)
  check('쫓아내기: 리모컨 주소 재발급', !!kick && kick.control_topic !== tp?.control_topic)
  check('쫓아내기: 기존 리모컨 토큰 거부', (await g({ p_token: ok?.token }))?.status === 'token_rejected')
  check('쫓아내기: 옛 비밀번호 거부 / 새 비밀번호 ok', (await g({ p_password: 'ctl-pass-1' }))?.status === 'bad_password' && (await g({ p_password: 'ctl-pass-9' }))?.status === 'ok')
  check('쫓아내기: 보기 토큰은 유지', (await v(code, { p_token: vok?.token }))?.status === 'ok')
  const h2 = await hj2()
  check('쫓아내기: 호스트 PC 는 그대로(새 주소를 받음)', h2?.status === 'ok' && h2.control_topic === kick?.control_topic)
  const sv = first<{ view_topic: string; has_view_password: boolean }>((await rpc(owner, 'set_view_password', { p_code: code, p_new_view_password: 'view-pass-2' })).data)
  check('보기 비밀번호 변경: 주소 재발급 + 기존 보기 토큰 거부', !!sv && sv.view_topic !== tp?.view_topic && (await v(code, { p_token: vok?.token }))?.status === 'token_rejected')
  check('보기 비밀번호 변경: 같은 비밀번호 거부', !!(await rpc(owner, 'set_view_password', { p_code: code, p_new_view_password: 'view-pass-2' })).error)
  check('보기 비밀번호 변경: 새 비밀번호 ok', (await v(code, { p_password: 'view-pass-2' }))?.status === 'ok')
  check('보기 비밀번호 변경: 호스트 PC 그대로', (await hj2())?.status === 'ok')
  check('비로그인은 보기 비밀번호 변경 불가', !!(await rpc(guest, 'set_view_password', { p_code: code, p_new_view_password: null })).error)
  await rpc(owner, 'set_view_password', { p_code: code, p_new_view_password: null })
  check('보기 비밀번호 없애기 → 번호만으로 보기', (await v(code, {}))?.status === 'ok')
  check('예전 "모든 기기 접속 끊기" 함수는 없음', !!(await rpc(owner, 'reset_channel_access', { p_code: code })).error)

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
