/**
 * 홈(/) 데이터·동작(화면은 HomeView 하나 — 기기 폭에 따라 CSS 로 배치).
 *
 * / — 로그인 없이 보인다.
 *  - 채널 번호로 입장(보기/리모컨)
 *  - 이 기기의 채널: 이 기기가 호스트(PC)·리모컨·보기로 들어간 채널(누르면 바로, 저장된 입장 정보로)
 *  - 공개 채널: 보기 비밀번호가 있고 최근 7일 안에 사용된 채널(로그인 불필요, 들어갈 때 보기 비밀번호)
 *  - 제목 검색: 대소문자·띄어쓰기 무시(shared/searchText)
 *  - 새 채널: 누를 때 로그인(로그인은 이 기기에 저장)
 *  - 로그인 중이면 내 계정의 전체 채널(다른 PC 에서 만든 것 포함)도 보이고, 열면 이 PC 가 호스트로 등록된다
 *  - 로컬 송출(/local): 채널·서버 없이 이 PC 하나에서만 송출(예배용 기본). 그 외는 전부 인터넷 송출(채널)
 *  - 곡 다운로드: 곡 전체를 PC 에 저장(그때 로그인). PC 에서 고친 곡은 '서버에 올리기'
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { session, signOut } from '@/lib/auth'
import { LOGIN_DOMAIN } from '@shared/loginId'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { listHosts, listVisits, saveHost, forgetChannelLocal, forgetVisit, type VisitRole } from '@/live/persistence'
import { titleMatches } from '@shared/searchText'
import { requireLogin } from '@/lib/loginPrompt'
import { useLibrary, loadCache, checkRemote, syncStatus, syncError, lastSync } from '@/library/library'
import { useSyncDialogs } from '@/control/useSyncDialogs'
import { isMobileOS } from '@/lib/device'

// 이 기기의 채널: 호스트(PC) 기록 + 리모컨·보기로 들어간 기록
export type Role = 'host' | VisitRole
export interface DeviceEntry { code: string; title: string; role: Role; at: string; needsLogin: boolean }

export function useHome() {
  const router = useRouter()

  /**
   * 폰·태블릿: 출력 창을 띄울 수 없으므로 로컬 송출·곡 다운로드 카드는 숨기고 '번호로 입장'을 맨 위로.
   * 채널 만들기는 남긴다 — 폰·태블릿이 호스트가 되고 빔 PC 는 보기 주소(/view, 넓은 화면 = 송출 화면)로 띄울 수 있으므로.
   * 곡은 컨트롤러의 곡 라이브러리에서도 로그인해 받을 수 있다. 고친 곡이 이 기기에 남아 있으면 곡 카드는 보인다(올리기 버튼).
   */
  const mobile = isMobileOS()

    const ROLE_LABEL: Record<Role, string> = { host: 'PC(호스트)', control: '리모컨', view: '보기' }
  function loadDevice(): DeviceEntry[] {
    const hosts = listHosts().map((h) => ({ code: h.code, title: h.title, role: 'host' as Role, at: h.openedAt, needsLogin: !h.token }))
    const visits = listVisits().map((v) => ({ code: v.code, title: v.title, role: v.role as Role, at: v.at, needsLogin: false }))
    return [...hosts, ...visits].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  }
  const device = ref(loadDevice())
  const hostCodes = computed(() => new Set(device.value.filter((d) => d.role === 'host').map((d) => d.code)))
  const openEntry = (e: DeviceEntry) => router.push(e.role === 'view' ? api.viewPath(e.code) : api.controlPath(e.code))
  /** 확인 없이 이 기기 기록 하나 지우기(호스트 = 선곡·호스트 권한, 리모컨·보기 = 방문 기록·입장 토큰) */
  function forgetSilently(e: Pick<DeviceEntry, 'code' | 'role'>) {
    if (e.role === 'host') forgetChannelLocal(e.code)
    else { forgetVisit(e.code, e.role); api.forgetToken(e.role, e.code) }
  }
  function forget(e: DeviceEntry) {
    const msg = e.role === 'host'
      ? `"${e.title}" 을(를) 이 기기 목록에서 지울까요?\n이 PC 의 선곡과 호스트 권한이 지워집니다. 서버의 채널은 그대로입니다.`
      : `"${e.title}" 을(를) 이 기기 목록에서 지울까요?\n다음에 들어갈 때 비밀번호를 다시 입력해야 할 수 있습니다.`
    if (!confirm(msg)) return
    forgetSilently(e)
    device.value = loadDevice()
  }
  /** PC 카드: 그 채널의 이 기기 기록(호스트·리모컨·보기)을 한 번에 */
  function forgetAll(code: string, title: string) {
    const roles = device.value.filter((d) => d.code === code)
    if (!roles.length) return
    const host = roles.some((r) => r.role === 'host')
    if (!confirm(`"${title}" 을(를) 이 기기 목록에서 지울까요?\n` + (host ? '이 PC 의 선곡과 호스트 권한이 지워집니다. ' : '다음에 들어갈 때 비밀번호를 다시 입력해야 할 수 있습니다. ') + '서버의 채널은 그대로입니다.')) return
    roles.forEach(forgetSilently)
    device.value = loadDevice()
  }

  // 공개 채널(로그인 불필요): 보기 비밀번호가 있고 최근 7일 안에 사용된 채널
  const pub = ref<api.PublicChannel[]>([])
  const pubErr = ref<string | null>(null)
  async function loadPublic() {
    if (!supabase) return
    const r = await api.listPublicChannels()
    pub.value = r.rows
    pubErr.value = r.error ?? null
  }

  // 내 계정의 채널(로그인 중일 때만)
  const rows = ref<api.ChannelRow[]>([])
  const listErr = ref<string | null>(null)
  async function loadServer() {
    if (!session.value) { rows.value = []; return }
    const r = await api.listChannels()
    rows.value = r.rows
    listErr.value = r.error ?? null
  }
  watch(session, loadServer)



  /** 머리에 늘 보이는 로그인 상태(공용 PC 에 로그인된 채로 두고 가는 일을 줄이려고). 로그인 도메인이면 아이디만 */
  const who = computed(() => {
    const e = session.value?.user.email ?? ''
    return e.endsWith(`@${LOGIN_DOMAIN}`) ? e.slice(0, -LOGIN_DOMAIN.length - 1) : e
  })
  async function logout() {
    await signOut()
    rows.value = []
  }

  /** 최근 사용(서버 상태 변경) 3시간 이내면 지금 예배 중일 수 있다고 강하게 경고 */
  const RECENT_MS = 3 * 60 * 60 * 1000
  function ago(iso: string): string {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`
    return `${Math.floor(m / 60 / 24)}일 전`
  }
  const delErr = ref<string | null>(null)
  /**
   * 내 계정의 채널 삭제: 로그인만으로(어느 기기에서 만들었든). 채널을 열지 않으므로 이 기기가 호스트로 등록되지 않는다.
   * 그 채널을 쓰던 호스트 PC 는 송출(출력 창)은 계속되고 '삭제됨' 표시로 바뀐다(sync.ts hostDeleted).
   */
  async function removeRow(r: api.ChannelRow) {
    delErr.value = null
    const recent = Date.now() - new Date(r.updated_at).getTime() < RECENT_MS
    const msg = (recent ? `⚠ 지금 예배 중일 수 있습니다 — ${ago(r.updated_at)} 사용됨\n\n` : '')
      + `채널 "${r.title}" (${r.code}) 을(를) 삭제할까요?\n마지막 사용: ${ago(r.updated_at)}\n\n`
      + '폰 리모컨·보기 연결이 모두 끊기고 되돌릴 수 없습니다.\n이 채널을 쓰는 PC 의 출력 창은 마지막 화면을 유지한 채 계속 송출됩니다.'
    if (!confirm(msg)) return
    const err = await api.deleteChannel(r.code)
    if (err) { delErr.value = err; return }
    forgetChannelLocal(r.code) // 이 기기에 남은 호스트 기록·선곡도
    device.value = loadDevice()
    await Promise.all([loadServer(), loadPublic()])
  }
  onMounted(() => { document.title = 'Biew'; void loadServer(); void loadPublic(); void loadCache().then(() => checkRemote()) })

  // 제목 검색(대소문자·띄어쓰기 무시) — 세 목록 모두
  const q = ref('')
  const fDevice = computed(() => device.value.filter((e) => titleMatches(e.title, q.value)))
  const fPub = computed(() => pub.value.filter((e) => titleMatches(e.title, q.value)))
  const fRows = computed(() => rows.value.filter((e) => titleMatches(e.title, q.value)))
  const anyList = computed(() => device.value.length + pub.value.length + rows.value.length > 0)

  // 곡(오프라인용). 평소 저장은 이 기기, DB 와는 [⬇ 다운로드]·[⬆ 업로드](비밀번호 재확인 → 목록) — src/library/library.ts
  const lib = useLibrary()
  const sync = useSyncDialogs()
  const dlText = computed(() => {
    switch (syncStatus.value) {
      case 'loading': return '저장된 곡 불러오는 중…'
      case 'checking': return 'DB 와 비교하는 중…'
      case 'downloading': return 'DB 에서 받는 중…'
      case 'offline': return '오프라인 — 저장된 곡 사용 중'
      case 'error': return `받기 실패: ${syncError.value}`
      default: return (lastSync.value ? `마지막 다운로드 ${new Date(lastSync.value).toLocaleString('ko-KR')}` : '아직 받지 않음') + (lib.remoteCount.value ? ` · DB 에서 바뀐 곡 ${lib.remoteCount.value}` : '')
    }
  })

  // 새 채널(로그인 팝업 → 로그인되면 바로 폼)
  const creatingOpen = ref(false)
  async function openCreate() { if (await requireLogin('채널을 만들려면 로그인하세요.')) creatingOpen.value = true }
  const title = ref('')
  const controlPw = ref('')
  const viewPw = ref('')
  const createErr = ref<string | null>(null)
  const creating = ref(false)
  async function create() {
    createErr.value = null
    if (!title.value.trim()) { createErr.value = '채널 제목을 입력하세요'; return }
    if (controlPw.value.length < 4) { createErr.value = '컨트롤 비밀번호는 4자 이상이어야 합니다'; return }
    if (viewPw.value && viewPw.value.length < 4) { createErr.value = '보기 비밀번호는 4자 이상이어야 합니다(비우면 누구나 볼 수 있음)'; return }
    creating.value = true
    const r = await api.createChannel(title.value.trim(), controlPw.value, viewPw.value)
    if (r.error || !r.code) { creating.value = false; createErr.value = r.error ?? '만들지 못했습니다'; return }
    // 이 PC 를 호스트로 등록(채널 전용 호스트 토큰). 이후 이 PC 에서는 로그인 없이 열린다
    const g = await api.issueHostToken(r.code)
    saveHost(r.code, { title: title.value.trim(), token: g.grant?.token ?? null, controlTopic: g.grant?.controlTopic ?? null, viewTopic: g.grant?.viewTopic ?? null })
    creating.value = false
    router.push(api.controlPath(r.code))
  }

  // 번호로 입장 (로그인 불필요)
  const joinRaw = ref('')
  const joinCode = computed(() => api.normalizeCode(joinRaw.value))
  const joinOk = computed(() => api.isCode(joinCode.value))
  const go = (kind: 'view' | 'control') => { if (joinOk.value) router.push(kind === 'view' ? api.viewPath(joinCode.value) : api.controlPath(joinCode.value)) }

  const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  /** 지금 열린 버전(빌드 시각·커밋). 앱 파일이 PC 에 저장돼 있어 새로고침만으로는 새 버전이 안 열리므로 확인용 */
  const build = __APP_BUILD__

  return {
    mobile, ROLE_LABEL, device, hostCodes, openEntry, forget, forgetAll, loadPublic, pub, pubErr, rows, listErr, loadServer,
    who, logout, ago, RECENT_MS, delErr, removeRow, q, fDevice, fPub, fRows, anyList,
    lib, sync, dlText, creatingOpen, openCreate, title, controlPw, viewPw, createErr, creating, create,
    joinRaw, joinCode, joinOk, go, fmt, build, router,
  }
}
