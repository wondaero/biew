<script setup lang="ts">
/**
 * / — 로그인 없이 보인다.
 *  - 채널 번호로 입장(보기/리모컨)
 *  - 이 기기의 채널: 이 PC 가 호스트로 연 채널(로그인·인터넷 불필요, 예배 당일 여기서 바로 들어감)
 *  - 새 채널: 누를 때 로그인(로그인은 저장되지 않음)
 *  - 로그인 중이면 내 계정의 전체 채널(다른 PC 에서 만든 것 포함)도 보이고, 열면 이 PC 가 호스트로 등록된다
 *  - 오프라인 모드(/local): 채널·서버 없이 이 PC 하나에서만 송출
 *  - 곡 다운로드: 곡 전체를 PC 에 저장(그때 로그인). PC 에서 고친 곡은 '서버에 올리기'
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { session, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { listHosts, saveHost, forgetChannelLocal } from '@/live/persistence'
import LoginForm from '@/components/LoginForm.vue'
import UploadDialog from '@/control/UploadDialog.vue'
import { useLibrary, loadCache, syncNow, resetCache, syncStatus, syncError, lastSync } from '@/library/library'

const router = useRouter()

// 이 기기의 채널
const local = ref(listHosts())
const localCodes = computed(() => new Set(local.value.map((r) => r.code)))
function forget(code: string, title: string) {
  if (!confirm(`"${title}" 을(를) 이 기기 목록에서 지울까요?\n이 PC 의 콘티와 호스트 연결 정보가 지워집니다. 서버의 채널은 그대로입니다.`)) return
  forgetChannelLocal(code)
  local.value = listHosts()
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
onMounted(() => { document.title = 'Biew'; void loadServer(); void loadCache() })

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
  // 이 PC 를 호스트로 기억(주소). 이후 이 PC 에서는 로그인 없이 열린다
  const t = await api.channelTopics(r.code)
  saveHost(r.code, { title: title.value.trim(), controlTopic: t?.controlTopic ?? null, viewTopic: t?.viewTopic ?? null })
  creating.value = false
  router.push(`/control/${r.code}`)
}

// 번호로 입장 (로그인 불필요)
const joinRaw = ref('')
const joinCode = computed(() => api.normalizeCode(joinRaw.value))
const joinOk = computed(() => api.isCode(joinCode.value))
const go = (kind: 'view' | 'control') => { if (joinOk.value) router.push(`/${kind}/${joinCode.value}`) }

const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <main class="home">
    <header>
      <h1>Biew</h1>
      <button v-if="session" class="ghost" @click="signOut()">로그아웃</button>
    </header>

    <!-- 이 기기의 채널 -->
    <section class="card">
      <h2>이 기기의 채널 <small>{{ local.length }}</small></h2>
      <p v-if="!local.length" class="muted">이 PC 에서 만들거나 연 채널이 여기에 표시됩니다. 로그인 없이 바로 들어갈 수 있습니다.</p>
      <ul v-else class="list">
        <li v-for="r in local" :key="r.code" @click="router.push(`/control/${r.code}`)">
          <span class="t">{{ r.title }}</span>
          <span class="c">{{ r.code }}</span>
          <button class="x" title="이 기기 목록에서 지우기" @click.stop="forget(r.code, r.title)">✕</button>
          <span class="d">{{ r.openedAt ? fmt(r.openedAt) : '' }}<template v-if="!r.controlTopic"> · 폰 연결하려면 로그인 필요</template></span>
        </li>
      </ul>
    </section>

    <!-- 오프라인 모드 -->
    <section class="card">
      <h2>오프라인 모드</h2>
      <p class="muted">채널 없이 이 PC 하나에서만 송출합니다(컨트롤러 + 출력 창). 인터넷·로그인 불필요 — 미리 곡을 다운로드해 두세요.</p>
      <button @click="router.push('/local')">오프라인 모드 열기</button>
    </section>

    <!-- 곡 다운로드 -->
    <section class="card">
      <h2>곡 <small>{{ lib.count.value }}곡 저장됨</small></h2>
      <p class="muted" :class="{ err: syncStatus === 'error' }">{{ dlText }}</p>
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

    <!-- 새 채널 -->
    <section class="card">
      <button v-if="!creatingOpen" class="primary" @click="creatingOpen = true">＋ 새 채널</button>
      <template v-else>
        <h2>새 채널 <button class="ghost" @click="creatingOpen = false">닫기</button></h2>
        <LoginForm v-if="!session" hint="채널을 만들려면 로그인하세요. (로그인은 저장되지 않습니다)" />
        <form v-else class="form" @submit.prevent="create">
          <input v-model="title" placeholder="채널 제목 (예: 주일 2부)" maxlength="60" />
          <input v-model="controlPw" type="password" placeholder="컨트롤 비밀번호 (필수, 4자 이상)" autocomplete="new-password" />
          <input v-model="viewPw" type="password" placeholder="보기 비밀번호 (선택 — 비우면 번호만 알면 누구나)" autocomplete="new-password" />
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
      <ul v-else-if="rows.length" class="list">
        <li v-for="r in rows" :key="r.code" @click="router.push(`/control/${r.code}`)">
          <span class="t">{{ r.title }}</span>
          <span class="c">{{ r.code }}</span>
          <span v-if="localCodes.has(r.code)" class="badge">이 기기</span>
          <span v-else-if="r.has_view_password" class="badge" title="보기 비밀번호 있음">🔒</span>
          <span v-else />
          <span class="d">{{ fmt(r.created_at) }}</span>
        </li>
      </ul>
    </section>

    <!-- 번호로 입장 -->
    <section class="card">
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
  </main>
</template>

<style scoped>
.home { max-width: 520px; margin: 0 auto; padding: 24px 16px 64px; display: grid; gap: 16px; }
header { display: flex; align-items: center; }
h1 { margin: 0; font-size: 22px; letter-spacing: .5px; flex: 1; }
h2 { margin: 0; font-size: 15px; display: flex; align-items: baseline; gap: 8px; }
h2 small { color: var(--muted); font-weight: normal; flex: 1; }
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
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list li {
  display: grid; grid-template-columns: 1fr auto auto; grid-template-areas: 't c x' 'd d d'; gap: 2px 10px; align-items: baseline;
  padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; cursor: pointer;
}
.list li:hover { border-color: #4a4a56; }
.t { grid-area: t; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c { grid-area: c; font: 12px ui-monospace, monospace; color: var(--muted); letter-spacing: 2px; }
.d { grid-area: d; font-size: 11px; color: var(--muted); }
.x { grid-area: x; padding: 0 6px; border: none; background: none; color: var(--muted); }
.x:hover { color: var(--pgm); }
.badge { grid-area: x; font-size: 11px; color: var(--muted); }
.upload { padding: 8px; color: var(--warn); border-color: #5a4a1e; background: #3a3014; }
</style>
