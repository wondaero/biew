<script setup lang="ts">
/**
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
import LoginForm from '@/components/LoginForm.vue'
import UploadDialog from '@/control/UploadDialog.vue'
import { dbNotice } from '@/library/db'
import { needRefresh, applyUpdate } from '@/pwa'
import { useLibrary, loadCache, syncNow, resetCache, syncStatus, syncError, lastSync } from '@/library/library'
import { isMobileOS } from '@/lib/device'

const router = useRouter()

/**
 * 폰·태블릿: 출력 창을 띄울 수 없으므로 로컬 송출·곡 다운로드 카드는 숨기고 '번호로 입장'을 맨 위로.
 * 채널 만들기는 남긴다 — 폰·태블릿이 호스트가 되고 빔 PC 는 보기 주소(/view, 넓은 화면 = 송출 화면)로 띄울 수 있으므로.
 * 곡은 컨트롤러의 곡 라이브러리에서도 로그인해 받을 수 있다. 고친 곡이 이 기기에 남아 있으면 곡 카드는 보인다(올리기 버튼).
 */
const mobile = isMobileOS()

// 이 기기의 채널: 호스트(PC) 기록 + 리모컨·보기로 들어간 기록
type Role = 'host' | VisitRole
interface DeviceEntry { code: string; title: string; role: Role; at: string; needsLogin: boolean }
const ROLE_LABEL: Record<Role, string> = { host: 'PC(호스트)', control: '리모컨', view: '보기' }
function loadDevice(): DeviceEntry[] {
  const hosts = listHosts().map((h) => ({ code: h.code, title: h.title, role: 'host' as Role, at: h.openedAt, needsLogin: !h.token }))
  const visits = listVisits().map((v) => ({ code: v.code, title: v.title, role: v.role as Role, at: v.at, needsLogin: false }))
  return [...hosts, ...visits].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
}
const device = ref(loadDevice())
const hostCodes = computed(() => new Set(device.value.filter((d) => d.role === 'host').map((d) => d.code)))
const openEntry = (e: DeviceEntry) => router.push(e.role === 'view' ? `/view/${e.code}` : `/control/${e.code}`)
function forget(e: DeviceEntry) {
  if (e.role === 'host') {
    if (!confirm(`"${e.title}" 을(를) 이 기기 목록에서 지울까요?\n이 PC 의 콘티와 호스트 권한이 지워집니다. 서버의 채널은 그대로입니다.`)) return
    forgetChannelLocal(e.code)
  } else {
    if (!confirm(`"${e.title}" 을(를) 이 기기 목록에서 지울까요?\n다음에 들어갈 때 비밀번호를 다시 입력해야 할 수 있습니다.`)) return
    forgetVisit(e.code, e.role)
    api.forgetToken(e.role, e.code)
  }
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

// 홈 로그인(이 기기에 저장 — 로그아웃할 때까지). 내 계정의 채널(삭제 포함)을 보려면 필요
const loginOpen = ref(false)
watch(session, (s) => { if (s) loginOpen.value = false })
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
  forgetChannelLocal(r.code) // 이 기기에 남은 호스트 기록·콘티도
  device.value = loadDevice()
  await Promise.all([loadServer(), loadPublic()])
}
onMounted(() => { document.title = 'Biew'; void loadServer(); void loadPublic(); void loadCache() })

// 제목 검색(대소문자·띄어쓰기 무시) — 세 목록 모두
const q = ref('')
const fDevice = computed(() => device.value.filter((e) => titleMatches(e.title, q.value)))
const fPub = computed(() => pub.value.filter((e) => titleMatches(e.title, q.value)))
const fRows = computed(() => rows.value.filter((e) => titleMatches(e.title, q.value)))
const anyList = computed(() => device.value.length + pub.value.length + rows.value.length > 0)

// 곡 다운로드(오프라인용). 로그인하면 library 가 자동으로 받는다(바뀐 곡만)
const lib = useLibrary()
const dlOpen = ref(false)
const showUpload = ref(false)
const dlText = computed(() => {
  switch (syncStatus.value) {
    case 'loading': return '저장된 곡 불러오는 중…'
    case 'syncing': return '서버에서 받는 중…'
    case 'offline': return '오프라인 — 저장된 곡 사용 중'
    case 'error': return `받기 실패: ${syncError.value}`
    default: return lastSync.value ? `마지막 다운로드 ${new Date(lastSync.value).toLocaleString('ko-KR')}` : '아직 받지 않음'
  }
})

// 새 채널
const creatingOpen = ref(false)
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
  router.push(`/control/${r.code}`)
}

// 번호로 입장 (로그인 불필요)
const joinRaw = ref('')
const joinCode = computed(() => api.normalizeCode(joinRaw.value))
const joinOk = computed(() => api.isCode(joinCode.value))
const go = (kind: 'view' | 'control') => { if (joinOk.value) router.push(`/${kind}/${joinCode.value}`) }

const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 지금 열린 버전(빌드 시각·커밋). 앱 파일이 PC 에 저장돼 있어 새로고침만으로는 새 버전이 안 열리므로 확인용 */
const build = __APP_BUILD__
</script>

<template>
  <main class="home" :class="{ mobile }">
    <header>
      <h1>Biew</h1>
      <span v-if="session" class="who" title="이 기기에 로그인이 저장돼 있습니다(로그아웃할 때까지)">{{ who }} 로그인됨</span>
      <button v-if="session" class="ghost" @click="logout">로그아웃</button>
      <button v-else-if="supabase" class="ghost" @click="loginOpen = !loginOpen">{{ loginOpen ? '닫기' : '로그인' }}</button>
    </header>
    <LoginForm v-if="!session && loginOpen" class="home-login" hint="로그인하면 내 계정의 채널(삭제 포함)·곡 다운로드·채널 만들기를 쓸 수 있습니다." />

    <!-- ── 로컬 송출 ── -->
    <section v-if="!mobile" class="card local">
      <h2>로컬 송출 <small>예배용 기본</small></h2>
      <p class="muted">이 PC 하나에서만 송출합니다(컨트롤러 + 출력 창). 인터넷·로그인·서버가 전혀 필요 없고, 다른 PC·폰은 접근할 수 없습니다. 곡은 아래에서 미리 다운로드해 두세요.</p>
      <button class="primary" @click="router.push('/local')">로컬 송출 열기</button>
    </section>

    <!-- 곡 다운로드 -->
    <section v-if="!mobile || lib.pendingCount.value" class="card">
      <h2>곡 <small>{{ lib.count.value }}곡 저장됨</small></h2>
      <p class="muted" :class="{ err: syncStatus === 'error' }">{{ dlText }}</p>
      <p v-if="dbNotice" class="warn">{{ dbNotice }}</p>
      <template v-if="session">
        <div class="row">
          <button :disabled="syncStatus === 'syncing'" @click="syncNow()">바뀐 곡 받기</button>
          <button :disabled="syncStatus === 'syncing'" @click="resetCache()">전체 다시 받기</button>
        </div>
      </template>
      <template v-else>
        <button v-if="!dlOpen" class="primary" @click="dlOpen = true">곡 다운로드</button>
        <LoginForm v-else hint="곡은 저작권 데이터라 로그인해야 받을 수 있습니다. 받은 곡은 로그인·인터넷 없이 계속 쓸 수 있습니다." />
      </template>
      <button v-if="lib.pendingCount.value" class="upload" @click="showUpload = true">↑ PC 에서 고친 곡 서버에 올리기 {{ lib.pendingCount.value }}건</button>
    </section>
    <UploadDialog v-if="showUpload" @close="showUpload = false" />

    <!-- ── 인터넷 송출 ── -->
    <h2 class="group">인터넷 송출 <small>폰 리모컨·보기 기기 · 서버를 거침 · 가끔 쓸 때</small></h2>

    <!-- 제목 검색(대소문자·띄어쓰기 무시) -->
    <input v-if="anyList" :value="q" class="search" type="search" placeholder="채널 제목 검색 (대소문자·띄어쓰기 무시)" @input="q = ($event.target as HTMLInputElement).value" />

    <!-- 이 기기의 채널 -->
    <section class="card">
      <h2>이 기기의 채널 <small>{{ device.length }}</small></h2>
      <p v-if="!device.length" class="muted">이 기기에서 만들었거나(PC) 리모컨·보기로 들어간 채널이 여기에 표시됩니다. 다음부터 누르면 바로 들어갑니다.</p>
      <p v-else-if="!fDevice.length" class="muted">검색 결과 없음</p>
      <ul v-else class="list">
        <li v-for="e in fDevice" :key="e.role + e.code" @click="openEntry(e)">
          <span class="t">{{ e.title || e.code }}</span>
          <span class="role" :class="e.role">{{ ROLE_LABEL[e.role] }}</span>
          <button class="x" title="이 기기 목록에서 지우기" @click.stop="forget(e)">✕</button>
          <span class="d">{{ e.code }} · {{ e.at ? fmt(e.at) : '' }}<template v-if="e.needsLogin"> · 폰·보기 연결하려면 로그인 필요</template></span>
        </li>
      </ul>
    </section>

    <!-- 공개 채널 -->
    <section v-if="supabase" class="card">
      <h2>공개 채널 <small>{{ pub.length }}</small></h2>
      <p class="muted">보기 비밀번호가 있는 채널만 보입니다(최근 7일). 보기·컨트롤 모두 들어갈 때 비밀번호가 필요합니다. 비밀번호가 없는 채널은 QR·링크·번호로 들어오세요.</p>
      <p v-if="pubErr" class="err">{{ pubErr }}</p>
      <p v-else-if="pub.length && !fPub.length" class="muted">검색 결과 없음</p>
      <!-- 공개 채널은 보기·컨트롤 비밀번호가 모두 있다(컨트롤은 생성 시 필수) → 입장 버튼 2개. 비밀번호 검사는 서버(join_view/join_control) -->
      <ul v-else-if="fPub.length" class="list">
        <li v-for="c in fPub" :key="c.code" class="pub-item">
          <span class="t">{{ c.title }}</span>
          <span class="badge" title="들어갈 때 비밀번호가 필요합니다">🔒 비밀번호</span>
          <span class="d">{{ fmt(c.updated_at) }} 사용</span>
          <div class="row pub-go">
            <button @click="router.push(`/view/${c.code}`)">보기로 입장</button>
            <button @click="router.push(`/control/${c.code}`)">컨트롤로 입장</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 새 채널 -->
    <section class="card">
      <button v-if="!creatingOpen" @click="creatingOpen = true">＋ 인터넷 송출 채널 만들기</button>
      <template v-else>
        <h2>새 채널 <button class="ghost" @click="creatingOpen = false">닫기</button></h2>
        <LoginForm v-if="!session" hint="채널을 만들려면 로그인하세요." />
        <form v-else class="form" @submit.prevent="create">
          <input v-model="title" placeholder="채널 제목 (예: 주일 2부)" maxlength="60" />
          <input v-model="controlPw" type="password" placeholder="컨트롤 비밀번호 (필수, 4자 이상)" autocomplete="new-password" />
          <input v-model="viewPw" type="password" placeholder="보기 비밀번호 (선택 — 비우면 번호만 알면 누구나)" autocomplete="new-password" />
          <p class="muted">보기 비밀번호를 정하면 홈의 <b>공개 채널</b>에 7일간 제목이 보입니다(들어갈 땐 비밀번호 필요). 비우면 목록에 안 뜨고 QR·링크·번호로만 들어옵니다. 공개되는 채널은 컨트롤 비밀번호를 6자 이상으로 권장합니다.</p>
          <button class="primary" :disabled="creating">{{ creating ? '만드는 중…' : '채널 만들기' }}</button>
          <p v-if="createErr" class="err">{{ createErr }}</p>
        </form>
      </template>
    </section>

    <!-- 내 계정의 채널(로그인 중) -->
    <section v-if="session" class="card">
      <h2>내 계정의 채널 <small>{{ rows.length }}</small></h2>
      <p class="muted">다른 PC 에서 만든 채널도 여기서 열면 이 PC 가 호스트로 등록됩니다.</p>
      <p v-if="listErr" class="err">{{ listErr }}</p>
      <p v-if="delErr" class="err">{{ delErr }}</p>
      <ul v-if="!listErr && fRows.length" class="list">
        <li v-for="r in fRows" :key="r.code" class="mine" @click="router.push(`/control/${r.code}?as=host`)">
          <span class="t">{{ r.title }}</span>
          <span class="c">{{ r.code }}</span>
          <span v-if="hostCodes.has(r.code)" class="badge">이 기기</span>
          <span v-else-if="r.has_view_password" class="badge" title="보기 비밀번호 있음">🔒</span>
          <span v-else class="badge" />
          <button class="del" title="채널 삭제(서버에서)" @click.stop="removeRow(r)">삭제</button>
          <span class="d">{{ fmt(r.created_at) }} 만듦 · {{ ago(r.updated_at) }} 사용</span>
        </li>
      </ul>
    </section>

    <!-- 번호로 입장 (폰·태블릿에선 맨 위) -->
    <section class="card join">
      <h2>채널 번호로 입장</h2>
      <input
        :value="joinCode"
        class="code"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="12"
        placeholder="ABC234"
        @input="joinRaw = ($event.target as HTMLInputElement).value"
        @keydown.enter="go('view')"
      />
      <div class="row">
        <button :disabled="!joinOk" @click="go('view')">보기</button>
        <button :disabled="!joinOk" @click="go('control')">컨트롤 (리모컨)</button>
      </div>
    </section>

    <p v-if="!supabase" class="warn">Supabase 설정(.env)이 없어 서버 기능(채널 만들기·리모컨·보기)을 쓸 수 없습니다.</p>

    <footer class="ver">
      버전 {{ fmt(build.time) }} 빌드 · {{ build.commit }}
      <button v-if="needRefresh" class="ghost" title="이 창이 새로고침됩니다" @click="applyUpdate">새 버전 있음 — 적용</button>
    </footer>
  </main>
</template>

<style scoped>
.home { max-width: 520px; margin: 0 auto; padding: 24px 16px 64px; display: grid; gap: 16px; }
header { display: flex; align-items: center; }
h1 { margin: 0; font-size: 22px; letter-spacing: .5px; flex: 1; }
h2 { margin: 0; font-size: 15px; display: flex; align-items: baseline; gap: 8px; }
h2 small { color: var(--muted); font-weight: normal; flex: 1; }
.group { margin: 8px 0 -6px; font-size: 13px; color: var(--muted); font-weight: 600; }
.card.local { border-color: var(--live); }
/* 폰·태블릿: 머리 → 번호로 입장 → 나머지(DOM 순서) */
.home.mobile > header { order: -2; }
.home.mobile > .join { order: -1; }
.card { display: grid; gap: 10px; padding: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.form { display: grid; gap: 8px; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.warn { margin: 0; color: var(--warn); font-size: 13px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.code { text-align: center; font: 700 26px/1 ui-monospace, monospace; letter-spacing: 6px; padding: 12px 8px; text-transform: uppercase; }
.row { display: flex; gap: 8px; }
.row button { flex: 1; padding: 10px; }
.card > button, .form > button { padding: 10px; }
.ghost { margin-left: auto; padding: 2px 8px; font-size: 12px; font-weight: normal; }
.who { font-size: 12px; color: var(--live); }
.who + .ghost { margin-left: 8px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list li {
  display: grid; grid-template-columns: 1fr auto auto; grid-template-areas: 't c x' 'd d d'; gap: 2px 10px; align-items: baseline;
  padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; cursor: pointer;
}
.list li:hover { border-color: #4a4a56; }
/* 공개 채널: 줄 클릭 대신 입장 버튼 2개 */
.list li.pub-item { grid-template-columns: 1fr auto; grid-template-areas: 't x' 'd d' 'g g'; cursor: default; }
.pub-go { grid-area: g; margin-top: 6px; }
/* 내 계정의 채널: 삭제 버튼 칸 추가 */
.list li.mine { grid-template-columns: 1fr auto auto auto; grid-template-areas: 't c x del' 'd d d d'; }
.del { grid-area: del; padding: 2px 8px; font-size: 11px; color: var(--muted); }
.del:hover { color: var(--pgm); border-color: var(--pgm); }
.home.mobile > .home-login { order: -1; } /* 폰: 머리 바로 아래(번호로 입장보다 위) */
.pub-go button { padding: 8px; }
.t { grid-area: t; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c { grid-area: c; font: 12px ui-monospace, monospace; color: var(--muted); letter-spacing: 2px; }
.d { grid-area: d; font-size: 11px; color: var(--muted); }
.x { grid-area: x; padding: 0 6px; border: none; background: none; color: var(--muted); box-shadow: none; margin: 0; }
.x:hover { color: var(--pgm); }
.badge { grid-area: x; font-size: 11px; color: var(--muted); }
.role { grid-area: c; font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #3a3a46; color: #ddd; white-space: nowrap; }
.role.host { background: #11291a; color: var(--live); }
.search { width: 100%; }
.ver { display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 11px; color: var(--muted); }
.ver .ghost { margin-left: 0; color: var(--accent); border-color: var(--accent); }
.upload { padding: 8px; color: var(--warn); border-color: #5a4a1e; background: #3a3014; }
</style>
