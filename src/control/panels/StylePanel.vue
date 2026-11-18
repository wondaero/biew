<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEFAULT_STYLE, type OutputStyle } from '@shared/types'
import { useLive } from '@/live/liveStore'
import { KEY_BLACK, KEY_GREEN, keyable, backdropCss, type Backdrop, type BgDirection } from '@shared/backdrop'
import { normalizeStyle, sameStyle } from '@shared/outputStyle'
import { presets, savePreset, deletePreset, findByName, exportJson, importJson, NAME_MAX, type StylePreset } from '@/live/stylePresets'

const live = useLive()
const st = computed(() => live.state.style)
const set = <K extends keyof OutputStyle>(k: K, v: OutputStyle[K]) => live.setStyle({ [k]: v } as Partial<OutputStyle>)
/** 슬라이더 채움 비율(--p) — 왼쪽(채운 부분)을 파랑으로. 크롬은 진행 부분 스타일이 없어 트랙 그라데이션으로 그린다(src/style.css) */
const fill = (v: number, min: number, max: number) => ({ '--p': `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%` })
const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const str = (e: Event) => (e.target as HTMLInputElement).value

// 오프라인에서도 바뀌지 않도록 웹폰트가 아닌 PC 설치 폰트만 사용
const FONTS: { label: string; value: string }[] = [
  // Pretendard 만 앱에 포함(src/style.css, 어느 PC 든 같음). 나머지는 그 PC 에 설치돼 있어야 하고, 없으면 다른 글꼴로 보인다
  { label: '기본 (Pretendard — 앱에 포함, 모든 PC 동일)', value: DEFAULT_STYLE.fontFamily },
  { label: '맑은 고딕 (PC 설치 글꼴)', value: '"Malgun Gothic", sans-serif' },
  { label: '나눔고딕 (PC 설치 글꼴)', value: '"NanumGothic", "나눔고딕", sans-serif' },
  { label: '나눔스퀘어 (PC 설치 글꼴)', value: '"NanumSquare", "나눔스퀘어", sans-serif' },
  { label: '나눔명조 (PC 설치 글꼴)', value: '"NanumMyeongjo", "나눔명조", serif' },
  { label: 'Noto Sans KR (PC 설치 글꼴)', value: '"Noto Sans KR", sans-serif' },
]
const isPreset = computed(() => FONTS.some((f) => f.value === st.value.fontFamily))

// ── 배경: 키잉용(검정·초록) · 단색 · 2색 그라데이션 ──
const bd = computed(() => st.value.backdrop)
const keyMode = computed(() => keyable(bd.value))
const solidColor = computed(() => (bd.value.kind === 'solid' ? bd.value.color : null))
const grad = computed(() => (bd.value.kind === 'gradient' ? bd.value : null))
const setBd = (b: Backdrop) => set('backdrop', b)
const solid = (color: string) => setBd({ kind: 'solid', color })
/** 단색으로: 그라데이션이었으면 시작 색, 키잉용 색이었으면 무난한 남색에서 시작 */
const toSolid = () => solid(grad.value ? grad.value.from : keyMode.value ? '#1e3a5f' : (solidColor.value ?? '#1e3a5f'))
/** 그라데이션으로: 지금 색 → 검정, 위→아래에서 시작 */
const toGradient = () => {
  if (grad.value) return
  const from = keyMode.value ? '#1e3a5f' : (solidColor.value ?? '#1e3a5f')
  setBd({ kind: 'gradient', from, to: '#000000', direction: 'to bottom' })
}
const setGrad = (patch: Partial<{ from: string; to: string; direction: BgDirection }>) => {
  if (grad.value) setBd({ ...grad.value, ...patch })
}
/** 두 색 바꾸기 — ↑ ← ↖ ↗ 방향도 이걸로 */
const swap = () => { if (grad.value) setBd({ ...grad.value, from: grad.value.to, to: grad.value.from }) }
const DIRS: { v: BgDirection; label: string; title: string }[] = [
  { v: 'to bottom', label: '↓', title: '위 → 아래' },
  { v: 'to right', label: '→', title: '왼쪽 → 오른쪽' },
  { v: 'to bottom right', label: '↘', title: '왼쪽 위 → 오른쪽 아래' },
  { v: 'to bottom left', label: '↙', title: '오른쪽 위 → 왼쪽 아래' },
]

// ── 저장된 설정(이 PC 에만 — src/live/stylePresets.ts) ──
const presetName = ref('')
const presetMsg = ref<{ text: string; err?: boolean } | null>(null)
const say = (text: string, err = false) => { presetMsg.value = { text, err } }
const activeId = computed(() => presets.value.find((p) => sameStyle(p.style, st.value))?.id ?? null)
function save() {
  const name = presetName.value.trim()
  if (findByName(name) && !confirm(`"${name}" 을(를) 지금 설정으로 덮어쓸까요?`)) return
  const err = savePreset(name, st.value)
  if (err) return say(err, true)
  presetName.value = ''
  say(`"${name}" 저장됨 (이 PC)`)
}
/** 불러오기 = 한 번의 변경으로 전체 교체 → 송출 화면도 한 번에 바뀐다 */
function apply(p: StylePreset) {
  live.setStyle(normalizeStyle(p.style))
  say(`"${p.name}" 적용됨`)
}
function remove(p: StylePreset) {
  if (!confirm(`저장된 설정 "${p.name}" 을(를) 지울까요?`)) return
  deletePreset(p.id)
  presetMsg.value = null
}
function exportFile() {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `biew-출력설정-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
async function importFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (f.size > 1_000_000) return say('파일이 너무 큽니다', true)
  const r = importJson(await f.text())
  if (r.error) return say(r.error, true)
  say(`가져옴: 새로 ${r.added}개 · 같은 이름 바꿈 ${r.replaced}개`)
}
</script>

<template>
  <section class="style">
    <h2>출력 설정</h2>

    <!-- 저장된 설정: 이 PC 에만(서버로 안 보냄) -->
    <div class="presets full">
      <div class="p-head"><span>저장된 설정</span><small>이 PC 에만 저장</small></div>
      <ul v-if="presets.length" class="p-list">
        <li v-for="p in presets" :key="p.id" :class="{ on: p.id === activeId }">
          <button class="p-apply" :title="`'${p.name}' 불러오기 — 송출 화면에 바로 적용됩니다`" @click="apply(p)">
            <span class="p-swatch" :style="{ background: backdropCss(p.style.backdrop), color: p.style.color }">가</span>
            <span class="p-name">{{ p.name }}</span>
            <span v-if="p.id === activeId" class="p-cur">적용 중</span>
          </button>
          <button class="p-del" title="지우기" @click="remove(p)">✕</button>
        </li>
      </ul>
      <p v-else class="muted">아직 없음 — 지금 설정에 이름을 붙여 저장해 두면 한 번에 불러올 수 있습니다.</p>
      <form class="p-save" @submit.prevent="save">
        <input v-model="presetName" :maxlength="NAME_MAX" placeholder="이름 (예: 본당 프로젝터)" />
        <button class="primary" :disabled="!presetName.trim()">현재 설정 저장</button>
      </form>
      <div class="p-file">
        <button type="button" :disabled="!presets.length" title="다른 PC 로 옮기거나 백업할 때" @click="exportFile">파일로 내보내기</button>
        <label class="p-import">파일에서 가져오기<input type="file" accept="application/json,.json" @change="importFile" /></label>
      </div>
      <p v-if="presetMsg" class="p-msg" :class="{ err: presetMsg.err }">{{ presetMsg.text }}</p>
    </div>

    <label>폰트
      <select :value="isPreset ? st.fontFamily : '__custom'" @change="str($event) !== '__custom' && set('fontFamily', str($event))">
        <option v-for="f in FONTS" :key="f.value" :value="f.value">{{ f.label }}</option>
        <option value="__custom">직접 입력…</option>
      </select>
    </label>
    <label v-if="!isPreset" class="full">폰트 이름
      <input :value="st.fontFamily" @change="set('fontFamily', str($event))" />
    </label>

    <label>크기 <output>{{ st.fontSize.toFixed(1) }}</output>
      <input type="range" min="3" max="15" step="0.1" :value="st.fontSize" :style="fill(st.fontSize, 3, 15)" @input="set('fontSize', num($event))" />
    </label>
    <label>굵기
      <select :value="st.fontWeight" @change="set('fontWeight', num($event) as OutputStyle['fontWeight'])">
        <option :value="400">보통</option><option :value="700">굵게</option><option :value="800">아주 굵게</option>
      </select>
    </label>
    <label>줄 간격 <output>{{ st.lineHeight.toFixed(2) }}</output>
      <input type="range" min="1" max="2" step="0.05" :value="st.lineHeight" :style="fill(st.lineHeight, 1, 2)" @input="set('lineHeight', num($event))" />
    </label>
    <label class="color">글자색 <output>{{ st.color.toUpperCase() }}</output><input type="color" :value="st.color" @input="set('color', str($event))" /></label>

    <label>외곽선 <output>{{ st.outlineWidth.toFixed(2) }}</output>
      <input type="range" min="0" max="1" step="0.05" :value="st.outlineWidth" :style="fill(st.outlineWidth, 0, 1)" @input="set('outlineWidth', num($event))" />
    </label>
    <label class="color">외곽선색 <output>{{ st.outlineColor.toUpperCase() }}</output><input type="color" :value="st.outlineColor" @input="set('outlineColor', str($event))" /></label>
    <label class="check"><input type="checkbox" :checked="st.shadow" @change="set('shadow', ($event.target as HTMLInputElement).checked)" /> 그림자</label>

    <div class="seg full">
      <span>위치</span>
      <button :class="{ on: st.position === 'top' }" @click="set('position', 'top')">위 기준</button>
      <button :class="{ on: st.position === 'center' }" @click="set('position', 'center')">세로 중앙</button>
    </div>
    <label v-if="st.position === 'top'">위 여백 <output>{{ st.topMargin.toFixed(0) }}</output>
      <input type="range" min="0" max="60" step="1" :value="st.topMargin" :style="fill(st.topMargin, 0, 60)" @input="set('topMargin', num($event))" />
    </label>
    <label>왼쪽 여백 <output>{{ st.leftMargin.toFixed(0) }}</output>
      <input type="range" min="0" max="40" step="1" :value="st.leftMargin" :style="fill(st.leftMargin, 0, 40)" @input="set('leftMargin', num($event))" />
    </label>

    <div class="bg full">
      <div class="seg">
        <span>배경</span>
        <button :class="{ on: keyMode === 'luma' }" title="ATEM 루마키용" @click="solid(KEY_BLACK)">검정 (루마키)</button>
        <button :class="{ on: keyMode === 'chroma' }" title="ATEM 크로마키용" @click="solid(KEY_GREEN)">초록 (크로마키)</button>
      </div>
      <div class="seg">
        <span />
        <button :class="{ on: !!solidColor && !keyMode }" @click="toSolid">단색</button>
        <button :class="{ on: !!grad }" @click="toGradient">그라데이션</button>
      </div>
      <label v-if="solidColor && !keyMode" class="color">색 <output>{{ solidColor.toUpperCase() }}</output><input type="color" :value="solidColor" @input="solid(str($event))" /></label>
      <template v-if="grad">
        <div class="grad">
          <input type="color" :value="grad.from" title="시작 색" @input="setGrad({ from: str($event) })" />
          <button title="두 색 바꾸기(방향 반대로)" @click="swap">⇄</button>
          <input type="color" :value="grad.to" title="끝 색" @input="setGrad({ to: str($event) })" />
        </div>
        <div class="seg">
          <span>방향</span>
          <button v-for="d in DIRS" :key="d.v" :class="{ on: grad.direction === d.v }" :title="d.title" @click="setGrad({ direction: d.v })">{{ d.label }}</button>
        </div>
      </template>
      <div class="swatch" :style="{ background: backdropCss(bd) }" />
      <p v-if="!keyMode" class="warn">이 배경은 ATEM 키잉(루마·크로마)에 쓸 수 없습니다. 프로젝터·TV 에 그대로 띄울 때만 쓰세요.</p>
    </div>
    <div class="seg full">
      <span>전환</span>
      <button :class="{ on: st.transition === 'cut' }" @click="set('transition', 'cut')">컷</button>
      <button :class="{ on: st.transition === 'fade' }" @click="set('transition', 'fade')">페이드</button>
    </div>
    <label v-if="st.transition === 'fade'">페이드 ms <output>{{ st.fadeMs }}</output>
      <input type="range" min="100" max="1000" step="50" :value="st.fadeMs" :style="fill(st.fadeMs, 100, 1000)" @input="set('fadeMs', num($event))" />
    </label>

    <button class="reset full danger-line" @click="live.setStyle({ ...DEFAULT_STYLE })">기본값으로</button>
  </section>
</template>

<style scoped>
/*
 * 한 줄에 하나(사용자 결정 — 2열은 긴 폰트 이름이 왼쪽 열을 밀어 2:1 로 보였음).
 * 각 항목: 위 줄 = 이름(왼쪽) · 값(오른쪽), 아래 줄 = 조절(슬라이더·선택) 전체 폭. 색은 한 줄(이름 · 코드 · 견본).
 */
.style { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; font-size: 12px; }
h2 { margin: 0; font-size: 14px; }
label { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 8px; color: var(--muted); }
label > output { color: var(--text); font-variant-numeric: tabular-nums; }
label > select, label > input:not([type='color']):not([type='checkbox']) { grid-column: 1 / -1; width: 100%; }
label.check { display: flex; align-items: center; gap: 6px; }
label.color { grid-template-columns: minmax(0, 1fr) auto auto; }
label.color > output { color: var(--muted); font: 11px ui-monospace, monospace; }
.full { grid-column: 1 / -1; }
/* 색 견본: 기본 막대 대신 작은 둥근 칸 */
input[type='color'] {
  -webkit-appearance: none; appearance: none; width: 44px; height: 24px; padding: 2px; cursor: pointer;
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px;
}
input[type='color']::-webkit-color-swatch-wrapper { padding: 0; }
input[type='color']::-webkit-color-swatch { border: 0; border-radius: 4px; }
input[type='color']::-moz-color-swatch { border: 0; border-radius: 4px; }
.grad input[type='color'] { width: 100%; }
.seg { display: flex; align-items: center; gap: 4px; }
.seg span { color: var(--muted); width: 36px; }
.seg button { flex: 1; padding: 4px; font-size: 12px; }
/* 고르기(세그먼트): 주요 동작(파랑 채움)과 헷갈리지 않게 옅게 채움 + 파랑 테두리 */
/* 고른 것 = 눌린 상태(평평 + 안쪽 그림자). 제자리(내려가지 않음) — 받침은 어두운 패널에서 거의 안 보여
   내리면 옆 버튼보다 아래로 처져 보인다(사용자 지적) → 위·아래를 옆 버튼의 보이는 면에 맞춘다 */
.seg button.on, .seg button.on:hover {
  background: rgba(79, 140, 255, .2); border-color: var(--accent);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, .45); color: #dbe7ff; font-weight: 600;
}
.reset { font-size: 12px; }
.bg { display: grid; gap: 6px; }
.grad { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: center; }
.grad button { padding: 4px 10px; }
.swatch { height: 22px; border-radius: 4px; border: 1px solid var(--line); }
.warn { margin: 0; font-size: 11px; color: var(--warn); }
.presets { display: grid; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.p-head { display: flex; align-items: baseline; justify-content: space-between; color: var(--muted); }
.p-head small { font-size: 11px; }
.p-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 180px; overflow-y: auto; }
.p-list li { display: flex; gap: 4px; }
.p-apply { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 4px 8px; text-align: left; font-size: 12px; }
.p-list li.on .p-apply { border-color: var(--accent); }
.p-swatch { flex: none; width: 22px; height: 16px; border-radius: 3px; border: 1px solid var(--line); font-size: 10px; font-weight: 700; display: grid; place-items: center; }
.p-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-cur { flex: none; font-size: 10px; color: var(--accent); }
.p-del { flex: none; padding: 0 8px; color: var(--muted); }
.p-save { display: flex; gap: 4px; }
.p-save input { flex: 1; min-width: 0; }
.p-save button, .p-file button, .p-import { font-size: 12px; padding: 4px 8px; white-space: nowrap; }
.p-file { display: flex; gap: 4px; }
.p-file > * { flex: 1; text-align: center; }
/* 버튼처럼 보이는 파일 선택(label) — 버튼과 같은 3D 모양 */
.p-import {
  display: block; cursor: pointer; color: var(--text); border-radius: 7px;
  background-color: #2b2b35; background-image: linear-gradient(to bottom, rgba(255, 255, 255, .09), rgba(255, 255, 255, 0) 70%);
  border: 1px solid #42424e; box-shadow: 0 2px 0 #0b0b0e; margin-bottom: 2px;
}
.p-import:hover { background-color: #34343f; }
.p-import:active { transform: translateY(2px); box-shadow: inset 0 2px 4px rgba(0, 0, 0, .35); }
.p-import input { display: none; }
.p-msg { margin: 0; font-size: 11px; color: var(--muted); }
.p-msg.err { color: var(--pgm); }
.muted { margin: 0; font-size: 11px; color: var(--muted); }
/* 좁은 화면: 한 줄에 하나씩 (2열이면 "줄 간격" 같은 라벨이 세로로 깨짐) */
@media (max-width: 768px) {
  .style { grid-template-columns: minmax(0, 1fr); font-size: 13px; }
  label.check { white-space: nowrap; }
}
</style>
