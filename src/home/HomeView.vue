<script setup lang="ts">
/**
 * 홈(/) — 모든 기기 공통 화면(사용자 요청 2026-11-21: '목록이 주인공 + 나머지는 버튼', 폰도 같은 화면).
 *  - 위쪽 막대: 곡 다운로드·업로드 · 로그인 상태
 *  - 도구 줄: 제목·번호 검색 · [번호로 입장] · [+ 새 채널] · [▶ 로컬 송출 열기](예배 기본 — 가장 강조)
 *  - 폰·태블릿(모바일 OS): 출력 창을 못 띄우므로 로컬 송출·곡 다운로드는 숨김(고친 곡이 남아 있으면 업로드만).
 *    번호로 받아 들어가는 일이 대부분이라 번호 입력칸을 맨 위에 바로 둔다(대화창 대신).
 *    채널 만들기는 남김 — 폰·태블릿이 호스트가 되고 빔 PC 는 보기 주소(넓은 화면 = 송출 화면)로 띄울 수 있으므로.
 *  - 좁은 화면은 CSS 로 줄바꿈·카드 1열.
 *  - 채널 카드 그리드: '이 기기의 채널'·'공개 채널'·'내 계정의 채널'을 번호 하나 = 카드 하나로 합치고 탭으로 거른다.
 *    이 기기에서의 역할(이 PC 호스트·리모컨·보기)은 배지로. 입장은 카드의 [보기]·[컨트롤] — 비밀번호·호스트 판단은 들어간 화면이 한다.
 *  - 새 채널·번호로 입장은 대화창.
 * 데이터·동작은 useHome.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { session } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { requireLogin } from '@/lib/loginPrompt'
import { dbNotice } from '@/library/db'
import { needRefresh, applyUpdate } from '@/pwa'
import { syncStatus } from '@/library/library'
import { titleMatches } from '@shared/searchText'
import { useBackClose } from '@/lib/backClose'
import UploadDialog from '@/control/UploadDialog.vue'
import DownloadDialog from '@/control/DownloadDialog.vue'
import { useHome, type Role } from './useHome'

const {
  mobile, device, pub, pubErr, rows, listErr, who, logout, ago, RECENT_MS, delErr, removeRow, forgetAll,
  lib, sync, dlText, creatingOpen, openCreate, title, controlPw, viewPw, createErr, creating, create,
  joinRaw, joinCode, joinOk, go, fmt, build, router,
} = useHome()

// ── 채널 카드: 번호 하나 = 카드 하나 ──
interface Card {
  code: string
  title: string
  at: string
  roles: Role[]
  pub: boolean
  mine: api.ChannelRow | null
  locked: boolean
  needsLogin: boolean
}
const later = (a: string, b: string | null | undefined) => (b && b > a ? b : a)
const cards = computed<Card[]>(() => {
  const m = new Map<string, Card>()
  const get = (code: string, t: string) => {
    let c = m.get(code)
    if (!c) { c = { code, title: t, at: '', roles: [], pub: false, mine: null, locked: false, needsLogin: false }; m.set(code, c) }
    return c
  }
  for (const d of device.value) {
    const c = get(d.code, d.title || d.code)
    if (!c.roles.includes(d.role)) c.roles.push(d.role)
    c.at = later(c.at, d.at)
    if (d.needsLogin) c.needsLogin = true
  }
  for (const p of pub.value) {
    const c = get(p.code, p.title)
    c.title = p.title; c.pub = true; c.locked = true
    c.at = later(c.at, p.updated_at)
  }
  for (const r of rows.value) {
    const c = get(r.code, r.title)
    c.title = r.title; c.mine = r; c.locked = r.has_view_password
    c.at = later(c.at, r.updated_at)
  }
  const order: Role[] = ['host', 'control', 'view']
  for (const c of m.values()) c.roles.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return [...m.values()].sort((a, b) => b.at.localeCompare(a.at))
})

type Tab = 'all' | 'device' | 'pub' | 'mine'
const tab = ref<Tab>('all')
const inTab = (c: Card, t: Tab) => t === 'all' || (t === 'device' && c.roles.length > 0) || (t === 'pub' && c.pub) || (t === 'mine' && !!c.mine)
const tabs = computed(() => {
  const list: { id: Tab; label: string; n: number }[] = [
    { id: 'all', label: '전체', n: cards.value.length },
    { id: 'device', label: mobile ? '이 기기' : '이 PC', n: cards.value.filter((c) => inTab(c, 'device')).length },
    { id: 'pub', label: '공개', n: cards.value.filter((c) => inTab(c, 'pub')).length },
  ]
  if (session.value) list.push({ id: 'mine', label: '내 계정', n: cards.value.filter((c) => inTab(c, 'mine')).length })
  return list
})
watch(session, (s) => { if (!s && tab.value === 'mine') tab.value = 'all' })

// 검색: 제목(대소문자·띄어쓰기 무시) 또는 번호(일부)
const q = ref('')
const shown = computed(() => {
  const digits = api.normalizeCode(q.value)
  return cards.value.filter((c) => inTab(c, tab.value) && (titleMatches(c.title, q.value) || (digits.length >= 2 && c.code.includes(digits))))
})

const ROLE_TEXT: Record<Role, string> = { host: mobile ? '이 기기 호스트' : '이 PC 호스트', control: '리모컨', view: '보기' }
/** 숫자 번호는 세 자리씩 띄워(불러 주기 쉽게). 예전 영문 번호는 그대로 */
const showCode = (c: string) => (api.isNumericCode(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : c)
/** 컨트롤 버튼: 이 PC 가 호스트면 바로 송출 화면, 내 계정 채널이면 이 PC 를 호스트로 등록해 연다(폰 화면 '내 계정의 채널'과 같은 규칙), 그 밖엔 리모컨(비밀번호) */
const isHost = (c: Card) => c.roles.includes('host')
/** 버튼 이름은 [보기]·[제어] 두 가지로 통일(2026-11-22 사용자 결정 — 송출 열기/이 PC 로 열기/컨트롤이 헷갈림). 어떤 역할로 열리는지는 배지·툴팁으로 */
const ctlTitle = (c: Card) => (isHost(c) ? '이 PC 에서 송출 조작(호스트)' : c.mine ? '이 PC 를 이 채널의 송출 PC(호스트)로 등록하고 조작합니다' : '리모컨으로 조작(컨트롤 비밀번호)')
const openCtl = (c: Card) => router.push(api.controlPath(c.code) + (!isHost(c) && c.mine ? '?as=host' : ''))
const recent = (c: Card) => !!c.at && Date.now() - new Date(c.at).getTime() < RECENT_MS

// ── 대화창: 새 채널 · 번호로 입장 ──
const joinOpen = ref(false)
useBackClose(() => creatingOpen.value, () => { if (!creating.value) creatingOpen.value = false })
useBackClose(() => joinOpen.value, () => { joinOpen.value = false })
const firstInput = ref<HTMLInputElement | null>(null)
watch([creatingOpen, joinOpen], async ([a, b]) => { if (a || b) { await nextTick(); firstInput.value?.focus() } })
function openJoin() { joinRaw.value = ''; joinOpen.value = true }
function closeDialogs() { if (!creating.value) creatingOpen.value = false; joinOpen.value = false }
</script>

<template>
  <main class="home" :class="{ mobile }">
    <!-- 위쪽 막대 -->
    <header class="hd-bar">
      <h1>Biew</h1>
      <div v-if="!mobile || lib.pendingCount.value" class="songs">
        <template v-if="!mobile">
          <span class="songs-n">{{ lib.count.value }}곡 저장됨</span>
          <span class="songs-st" :class="{ err: syncStatus === 'error' }" :title="dlText">{{ dlText }}</span>
          <button :class="{ primary: !lib.count.value }" title="DB → 이 기기: 다른 곡 골라 받기 / 전체 받기" @click="sync.openDownload()">⬇ 곡 다운로드{{ lib.remoteCount.value ? ` ${lib.remoteCount.value}` : '' }}</button>
        </template>
        <button class="upload" title="이 기기 → DB: 이 기기에서 바꾼 곡 골라 올리기" @click="sync.openUpload()">⬆ 업로드{{ lib.pendingCount.value ? ` ${lib.pendingCount.value}` : '' }}</button>
      </div>
      <div class="account">
        <template v-if="session">
          <span class="who" title="이 기기에 로그인이 저장돼 있습니다(로그아웃할 때까지)">{{ who }} 로그인됨</span>
          <button @click="logout">로그아웃</button>
        </template>
        <button v-else-if="supabase" class="login-btn" @click="requireLogin('로그인하면 내 계정의 채널(삭제 포함)·곡 다운로드·채널 만들기를 쓸 수 있습니다.')">로그인</button>
      </div>
    </header>
    <UploadDialog v-if="sync.open.value === 'up'" @close="sync.close()" />
    <DownloadDialog v-if="sync.open.value === 'down'" @close="sync.close()" />

    <!-- 폰·태블릿: 번호로 입장을 맨 위에 바로 -->
    <form v-if="mobile" class="join-inline" @submit.prevent="go('view')">
      <h2>채널 번호로 입장</h2>
      <input
        :value="joinCode"
        class="code"
        inputmode="numeric"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="12"
        placeholder="123456"
        @input="joinRaw = ($event.target as HTMLInputElement).value"
      />
      <div class="row">
        <button type="submit" :disabled="!joinOk">보기</button>
        <button type="button" :disabled="!joinOk" @click="go('control')">제어 (리모컨)</button>
      </div>
    </form>

    <!-- 도구 줄 -->
    <div class="hd-tools">
      <input v-model="q" class="search" type="search" placeholder="🔍 채널 제목·번호 검색" />
      <button v-if="!mobile" @click="openJoin">번호로 입장</button>
      <button class="create-open" @click="openCreate">＋ 새 채널</button>
      <button v-if="!mobile" class="primary local-open" title="이 PC 하나에서만 송출(컨트롤러 + 출력 창). 인터넷·로그인·서버가 필요 없습니다" @click="router.push('/local')">▶&#xFE0E; 로컬 송출 열기</button>
    </div>

    <p v-if="!supabase" class="warn">Supabase 설정(.env)이 없어 서버 기능(채널 만들기·리모컨·보기)을 쓸 수 없습니다.</p>
    <p v-if="dbNotice" class="warn">{{ dbNotice }}</p>
    <p v-if="pubErr" class="err">공개 채널: {{ pubErr }}</p>
    <p v-if="listErr" class="err">내 계정의 채널: {{ listErr }}</p>
    <p v-if="delErr" class="err">{{ delErr }}</p>

    <!-- 채널 -->
    <section class="hd-list">
      <div class="hd-head">
        <h2>인터넷 송출 채널</h2>
        <nav class="tabs">
          <button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id }" @click="tab = t.id">{{ t.label }} <small>{{ t.n }}</small></button>
        </nav>
      </div>

      <div v-if="!cards.length" class="empty">
        <p class="big">인터넷 송출 채널이 없습니다</p>
        <p v-if="mobile" class="muted">받은 번호를 위에 입력해 들어가세요. 이 기기에서 들어간 채널, 보기 비밀번호가 있는 공개 채널(최근 7일)<template v-if="session">, 내 계정의 채널</template>이 여기에 모입니다.</p>
        <p v-else class="muted">예배는 보통 <b>로컬 송출</b>(이 PC 하나, 인터넷 불필요)로 합니다. 폰 리모컨·보기 기기가 필요할 때만 채널을 만드세요.<br />이 PC 에서 만들었거나 들어간 채널, 보기 비밀번호가 있는 공개 채널(최근 7일)<template v-if="session">, 내 계정의 채널</template>이 여기에 모입니다.</p>
        <div v-if="!mobile" class="empty-go">
          <button class="primary" @click="router.push('/local')">▶&#xFE0E; 로컬 송출 열기</button>
          <button @click="openCreate">＋ 새 채널</button>
          <button @click="openJoin">번호로 입장</button>
        </div>
      </div>
      <p v-else-if="!shown.length" class="muted none">조건에 맞는 채널이 없습니다.</p>

      <ul v-else class="grid">
        <li v-for="c in shown" :key="c.code" class="ch" :class="{ host: c.roles.includes('host') }">
          <div class="ch-top">
            <span class="ch-title" :title="c.title">{{ c.title }}</span>
            <span v-if="c.locked" class="lock" title="보기 비밀번호 있음">🔒</span>
          </div>
          <div class="ch-code">{{ showCode(c.code) }}</div>
          <div class="ch-badges">
            <span v-for="r in c.roles" :key="r" class="role" :class="r">{{ ROLE_TEXT[r] }}</span>
            <span v-if="c.mine" class="tag">내 계정</span>
            <span v-if="c.pub" class="tag">공개</span>
          </div>
          <div class="ch-meta">
            <span v-if="c.at"><i v-if="recent(c)" class="dot" title="3시간 안에 사용됨 — 지금 예배 중일 수 있음" />{{ ago(c.at) }} 사용 · {{ fmt(c.at) }}</span>
            <span v-if="c.needsLogin" class="warn-s">폰·보기 연결하려면 로그인 필요</span>
          </div>
          <div class="ch-go">
            <button @click="router.push(api.viewPath(c.code))">보기</button>
            <button class="ctl" :class="{ primary: isHost(c) }" :title="ctlTitle(c)" @click="openCtl(c)">제어</button>
          </div>
          <div v-if="c.roles.length || (c.mine && session)" class="ch-more">
            <!-- 보통 크기 버튼(14px — 작은 버튼 없애기 규칙). 삭제는 확인창을 거치는 위험 동작이라 danger-line -->
            <button v-if="c.roles.length" class="quiet forget" :title="`${mobile ? '이 기기' : '이 PC'}에 남은 기록(선곡·입장 정보)만 지웁니다. 서버의 채널은 그대로`" @click="forgetAll(c.code, c.title)">목록에서 지우기</button>
            <button v-if="c.mine && session" class="danger-line del" title="서버에서 채널 삭제(되돌릴 수 없음)" @click="removeRow(c.mine!)">채널 삭제</button>
          </div>
        </li>
      </ul>
    </section>

    <footer class="ver">
      버전 {{ fmt(build.time) }} 빌드 · {{ build.commit }}
      <button v-if="needRefresh" title="이 창이 새로고침됩니다" @click="applyUpdate">새 버전 있음 — 적용</button>
    </footer>

    <!-- 대화창 -->
    <div v-if="creatingOpen || joinOpen" class="hd-modal" @click.self="closeDialogs" @keydown.esc="closeDialogs">
      <form v-if="creatingOpen" class="hd-dlg m-full" @submit.prevent="create">
        <h3>새 채널 <button type="button" class="x" aria-label="닫기" :disabled="creating" @click="creatingOpen = false">✕</button></h3>
        <input ref="firstInput" v-model="title" placeholder="채널 제목 (예: 주일 2부)" maxlength="60" />
        <input v-model="controlPw" type="password" placeholder="컨트롤 비밀번호 (필수, 4자 이상)" autocomplete="new-password" />
        <input v-model="viewPw" type="password" placeholder="보기 비밀번호 (선택)" autocomplete="new-password" />
        <p class="muted">보기 비밀번호를 정하면 홈의 <b>공개</b> 목록에 7일간 제목이 보입니다(들어갈 땐 비밀번호 필요). 비우면 목록에 안 뜨지만, <b>번호(숫자 6자리)만 알면 누구나 볼 수 있습니다.</b> 공개되는 채널은 컨트롤 비밀번호를 6자 이상으로 권장합니다.</p>
        <p v-if="createErr" class="err">{{ createErr }}</p>
        <button class="primary" :disabled="creating">{{ creating ? '만드는 중…' : '채널 만들기' }}</button>
      </form>
      <form v-else class="hd-dlg m-full" @submit.prevent="go('view')">
        <h3>번호로 입장 <button type="button" class="x" aria-label="닫기" @click="joinOpen = false">✕</button></h3>
        <input
          ref="firstInput"
          :value="joinCode"
          class="code"
          inputmode="numeric"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          maxlength="12"
          placeholder="123456"
          @input="joinRaw = ($event.target as HTMLInputElement).value"
        />
        <div class="row">
          <button type="submit" :disabled="!joinOk">보기</button>
          <button type="button" :disabled="!joinOk" @click="go('control')">제어 (리모컨)</button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
/* 이름은 hd- 접두사: scoped 스타일이 자식 컴포넌트 최상위에도 걸리므로(CLAUDE.md 함정) 범용 이름을 피한다 */
.home { max-width: 1320px; margin: 0 auto; padding: 20px 32px 48px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.hd-bar { display: flex; align-items: center; gap: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
h1 { margin: 0; font-size: 22px; letter-spacing: .5px; }
.songs { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.songs-n { font-size: 13px; font-weight: 600; white-space: nowrap; }
.songs-st { min-width: 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 4px; }
.songs-st.err { color: var(--pgm); }
.upload { color: var(--warn); border-color: #5a4a1e; background: #3a3014; }
.account { display: flex; align-items: center; gap: 8px; padding-left: 20px; border-left: 1px solid var(--line); }
.who { font-size: 12px; color: var(--live); white-space: nowrap; }
button { white-space: nowrap; }

.hd-tools { display: flex; gap: 8px; align-items: center; }
.search { flex: 1; min-width: 0; max-width: 520px; margin-right: auto; padding: 9px 12px; }
.hd-tools button { padding: 9px 16px; }
.local-open { font-weight: 700; padding: 9px 22px !important; }

.hd-list { display: grid; gap: 12px; padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.hd-head { display: flex; align-items: center; gap: 16px; }
h2 { margin: 0; font-size: 15px; }
.tabs { display: flex; gap: 4px; padding: 3px; background: var(--panel-2); border-radius: 8px; }
.tabs button { padding: 5px 14px; font-size: 14px; border-color: transparent; background: none; box-shadow: none; }
.tabs button.on { background: var(--bg); border-color: var(--line); font-weight: 600; }
.tabs small { color: var(--muted); margin-left: 2px; }

/* min(260px, 100%): 좁은 폰(280px)에서 카드가 칸보다 넓어져 가로로 넘치지 않게 */
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 12px; }
/* min-width:0 — 긴 제목이 칸을 밀어내지 않게. 세로 flex + 버튼 줄 margin-top:auto — 같은 줄 카드의 버튼 높이를 맞춘다 */
.ch { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 14px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; }
.ch.host { border-color: color-mix(in srgb, var(--live) 45%, var(--line)); }
.ch-top { display: flex; gap: 6px; align-items: baseline; }
.ch-title { flex: 1; min-width: 0; font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lock { font-size: 12px; }
.ch-code { font: 700 22px/1 ui-monospace, monospace; letter-spacing: 3px; }
.ch-badges { display: flex; flex-wrap: wrap; gap: 4px; min-height: 18px; }
.role, .tag { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #3a3a46; color: #ddd; }
.role.host { background: #11291a; color: var(--live); }
.tag { background: none; border: 1px solid var(--line); color: var(--muted); }
.ch-meta { display: grid; gap: 2px; font-size: 11px; color: var(--muted); }
.dot { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--live); vertical-align: 1px; }
.warn-s { color: var(--warn); }
.ch-go { display: flex; gap: 6px; margin-top: auto; }
.ch-go button { flex: 1; min-width: 0; padding: 8px; }
.ch-more { display: flex; justify-content: space-between; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
.ch-more button { flex: 1; min-width: 0; font-size: 14px; padding: 6px 8px; margin-bottom: 0; white-space: nowrap; }

.empty { display: grid; justify-items: center; gap: 10px; padding: 48px 16px; text-align: center; }
.empty .big { margin: 0; font-size: 17px; font-weight: 700; }
.empty .muted { max-width: 620px; line-height: 1.6; }
.empty-go { display: flex; gap: 8px; margin-top: 6px; }
.empty-go button { padding: 10px 18px; }
.none { padding: 24px 0; text-align: center; }

.muted { margin: 0; color: var(--muted); font-size: 12px; }
.warn { margin: 0; color: var(--warn); font-size: 13px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.ver { display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 11px; color: var(--muted); }
.ver button { font-size: 12px; color: var(--accent); border-color: var(--accent); }

.hd-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgb(0 0 0 / .55); }
/* minmax(0,1fr): 넓은 숫자칸·버튼 줄이 칸을 넓혀 좁은 폰(280px)에서 가로로 넘치지 않게 */
.hd-dlg { width: min(440px, calc(100vw - 32px)); display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 60px rgb(0 0 0 / .5); }
.hd-dlg h3 { margin: 0 0 4px; display: flex; align-items: center; font-size: 16px; }
.hd-dlg .x { margin-left: auto; padding: 2px 8px; }
.hd-dlg > button { padding: 10px; }
.code { text-align: center; font: 700 26px/1 ui-monospace, monospace; letter-spacing: 6px; padding: 12px 8px; text-transform: uppercase; }
.row { display: flex; gap: 8px; }
.row button { flex: 1; padding: 10px; }

/* 폰 번호 입력 */
.join-inline { display: grid; gap: 10px; padding: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.join-inline .code { width: 100%; min-width: 0; }
.join-inline .row { flex-wrap: wrap; }
.join-inline .row button { flex: 1 1 120px; white-space: nowrap; }

/* 좁은 화면(폰·좁은 창): 줄바꿈, 여백 줄임 */
@media (max-width: 760px) {
  .home { padding: 16px 16px 48px; gap: 12px; }
  .hd-bar { flex-wrap: wrap; gap: 10px; }
  h1 { flex: 1; }
  .songs { order: 3; flex: 1 1 100%; justify-content: flex-start; flex-wrap: wrap; }
  .songs-st { flex: 1 1 100%; order: -1; }
  .songs button { flex: 1 1 140px; }
  .account { padding-left: 0; border-left: 0; }
  .hd-tools { flex-wrap: wrap; }
  .search { flex: 1 1 100%; max-width: none; margin-right: 0; }
  .hd-tools button { flex: 1 1 120px; padding: 10px; }
  .local-open { padding: 10px !important; }
  .hd-list { padding: 12px; }
  .hd-head { flex-wrap: wrap; gap: 10px; }
  .tabs { max-width: 100%; overflow-x: auto; }
  .empty { padding: 28px 8px; }
  /* 빈 상태 버튼: 한 줄에 하나씩, 폭 꽉 채워(사용자 요청 2026-11-21) */
  .empty-go { flex-direction: column; justify-self: stretch; }
  .empty-go button { width: 100%; }
}
/* 폰·좁은 창: 대화창은 전체 화면(입력칸 — 화면 키패드에 가리지 않게), 내용은 위에서부터 */
@media (max-width: 768px) {
  .hd-dlg { --m-pad-top: 12px; --m-pad-bottom: 16px; align-content: start; overflow-y: auto; }
  .hd-dlg .code { width: 100%; min-width: 0; letter-spacing: 4px; }
  .hd-dlg .row { flex-wrap: wrap; }
  .hd-dlg .row button { flex: 1 1 110px; min-width: 0; }
}
</style>
