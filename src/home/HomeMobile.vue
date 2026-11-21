<script setup lang="ts">
/** 홈 — 폰·태블릿·좁은 창(한 줄 카드). 넓은 PC 는 HomeDesk. 데이터·동작은 useHome */
import { session } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import * as api from '@/channel/api'
import { requireLogin } from '@/lib/loginPrompt'
import { dbNotice } from '@/library/db'
import { needRefresh, applyUpdate } from '@/pwa'
import { syncStatus } from '@/library/library'
import UploadDialog from '@/control/UploadDialog.vue'
import DownloadDialog from '@/control/DownloadDialog.vue'
import { useHome } from './useHome'

const {
  mobile, ROLE_LABEL, device, hostCodes, openEntry, forget, forgetAll, loadPublic, pub, pubErr, rows, listErr, loadServer,
    who, logout, ago, RECENT_MS, delErr, removeRow, q, fDevice, fPub, fRows, anyList,
    lib, sync, dlText, creatingOpen, openCreate, title, controlPw, viewPw, createErr, creating, create,
    joinRaw, joinCode, joinOk, go, fmt, build, router,
} = useHome()
</script>


<template>
  <main class="home" :class="{ mobile }">
    <header>
      <h1>Biew</h1>
      <span v-if="session" class="who" title="이 기기에 로그인이 저장돼 있습니다(로그아웃할 때까지)">{{ who }} 로그인됨</span>
      <button v-if="session" class="ghost" @click="logout">로그아웃</button>
      <button v-else-if="supabase" class="ghost login-btn" @click="requireLogin('로그인하면 내 계정의 채널(삭제 포함)·곡 다운로드·채널 만들기를 쓸 수 있습니다.')">로그인</button>
    </header>


    <div class="col col-l">
    <!-- ── 로컬 송출 ── -->
    <section v-if="!mobile" class="card local">
      <h2>로컬 송출 <small>예배용 기본</small></h2>
      <p class="muted">이 PC 하나에서만 송출합니다(컨트롤러 + 출력 창). 인터넷·로그인·서버가 전혀 필요 없고, 다른 PC·폰은 접근할 수 없습니다. 곡은 아래에서 미리 다운로드해 두세요.</p>
      <button class="primary local-open" @click="router.push('/local')">로컬 송출 열기</button>
    </section>

    <!-- 곡 다운로드 -->
    <section v-if="!mobile || lib.pendingCount.value" class="card">
      <h2>곡 <small>{{ lib.count.value }}곡 저장됨</small></h2>
      <p class="muted" :class="{ err: syncStatus === 'error' }">{{ dlText }}</p>
      <p v-if="dbNotice" class="warn">{{ dbNotice }}</p>
      <!-- DB 와 주고받기: 곡 목록 팝업과 같은 두 버튼(비밀번호 재확인 → 목록) -->
      <div class="row">
        <button :class="{ primary: !lib.count.value }" title="DB → 이 기기: 다른 곡 골라 받기 / 전체 받기" @click="sync.openDownload()">⬇ 곡 다운로드{{ lib.remoteCount.value ? ` ${lib.remoteCount.value}` : '' }}</button>
        <button class="upload" title="이 기기 → DB: 이 기기에서 바꾼 곡 골라 올리기" @click="sync.openUpload()">⬆ 업로드{{ lib.pendingCount.value ? ` ${lib.pendingCount.value}` : '' }}</button>
      </div>
    </section>
    <UploadDialog v-if="sync.open.value === 'up'" @close="sync.close()" />
    <DownloadDialog v-if="sync.open.value === 'down'" @close="sync.close()" />
    </div>

    <div class="col col-r">
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
            <button @click="router.push(api.viewPath(c.code))">보기로 입장</button>
            <button @click="router.push(api.controlPath(c.code))">컨트롤로 입장</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 새 채널 -->
    <section class="card">
      <button v-if="!creatingOpen" class="create-open" @click="openCreate">＋ 인터넷 송출 채널 만들기</button>
      <template v-else>
        <h2>새 채널 <button class="ghost" @click="creatingOpen = false">닫기</button></h2>
        <button v-if="!session" class="primary" @click="openCreate">로그인</button>
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
        <li v-for="r in fRows" :key="r.code" class="mine" @click="router.push(`${api.controlPath(r.code)}?as=host`)">
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
        inputmode="numeric"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        maxlength="12"
        placeholder="123456"
        @input="joinRaw = ($event.target as HTMLInputElement).value"
        @keydown.enter="go('view')"
      />
      <div class="row">
        <button :disabled="!joinOk" @click="go('view')">보기</button>
        <button :disabled="!joinOk" @click="go('control')">컨트롤 (리모컨)</button>
      </div>
    </section>
    </div>

    <p v-if="!supabase" class="warn">Supabase 설정(.env)이 없어 서버 기능(채널 만들기·리모컨·보기)을 쓸 수 없습니다.</p>

    <footer class="ver">
      버전 {{ fmt(build.time) }} 빌드 · {{ build.commit }}
      <button v-if="needRefresh" class="ghost" title="이 창이 새로고침됩니다" @click="applyUpdate">새 버전 있음 — 적용</button>
    </footer>
  </main>
</template>

<style scoped>
.home { max-width: 520px; margin: 0 auto; padding: 24px 16px 64px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; } /* minmax(0,…): 긴 내용이 열을 넓혀 좁은 폰(280px)에서 가로로 넘치지 않게 */
header { display: flex; align-items: center; }
h1 { margin: 0; font-size: 22px; letter-spacing: .5px; flex: 1; }
h2 { margin: 0; font-size: 15px; display: flex; align-items: baseline; gap: 8px; }
h2 small { color: var(--muted); font-weight: normal; flex: 1; }
.group { margin: 8px 0 -6px; font-size: 13px; color: var(--muted); font-weight: 600; }
.card.local { border-color: var(--live); }
/* 폰·태블릿: 머리 → 번호로 입장 → 나머지(DOM 순서). .col 은 contents 라 .join 도 .home 의 칸으로 정렬된다 */
.home.mobile > header { order: -2; }
.home.mobile .join { order: -1; }
/* 두 칸 묶음: 평소(폰·좁은 창)엔 없는 것처럼 */
.col { display: contents; }
.card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
.form { display: grid; gap: 8px; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
.warn { margin: 0; color: var(--warn); font-size: 13px; }
.err { margin: 0; color: var(--pgm); font-size: 13px; }
.code { text-align: center; font: 700 26px/1 ui-monospace, monospace; letter-spacing: 6px; padding: 12px 8px; text-transform: uppercase; width: 100%; min-width: 0; }
.row { display: flex; flex-wrap: wrap; gap: 8px; } /* 좁은 폰(280px)에선 버튼이 두 줄로 쌓인다 — 글자가 버튼 안에서 꺾이지 않게 */
.row button { flex: 1 1 120px; min-width: 0; padding: 10px; white-space: nowrap; }
.card > button, .form > button { padding: 10px; }
.ghost { margin-left: auto; font-size: 14px; font-weight: normal; white-space: nowrap; }
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
.del { grid-area: del; font-size: 14px; color: var(--muted); white-space: nowrap; }
.del:hover { color: var(--pgm); border-color: var(--pgm); }

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
