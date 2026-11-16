<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_STYLE, type OutputStyle } from '@shared/types'
import { useLive } from '@/live/liveStore'

const live = useLive()
const st = computed(() => live.state.style)
const set = <K extends keyof OutputStyle>(k: K, v: OutputStyle[K]) => live.setStyle({ [k]: v } as Partial<OutputStyle>)
const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const str = (e: Event) => (e.target as HTMLInputElement).value

// 오프라인에서도 바뀌지 않도록 웹폰트가 아닌 PC 설치 폰트만 사용
const FONTS: { label: string; value: string }[] = [
  { label: '기본 (Pretendard → 맑은 고딕)', value: DEFAULT_STYLE.fontFamily },
  { label: '맑은 고딕', value: '"Malgun Gothic", sans-serif' },
  { label: '나눔고딕', value: '"NanumGothic", "나눔고딕", sans-serif' },
  { label: '나눔스퀘어', value: '"NanumSquare", "나눔스퀘어", sans-serif' },
  { label: '나눔명조', value: '"NanumMyeongjo", "나눔명조", serif' },
  { label: 'Noto Sans KR', value: '"Noto Sans KR", sans-serif' },
]
const isPreset = computed(() => FONTS.some((f) => f.value === st.value.fontFamily))
</script>

<template>
  <section class="style">
    <h2>출력 설정</h2>

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
      <input type="range" min="3" max="15" step="0.1" :value="st.fontSize" @input="set('fontSize', num($event))" />
    </label>
    <label>굵기
      <select :value="st.fontWeight" @change="set('fontWeight', num($event) as OutputStyle['fontWeight'])">
        <option :value="400">보통</option><option :value="700">굵게</option><option :value="800">아주 굵게</option>
      </select>
    </label>
    <label>줄 간격 <output>{{ st.lineHeight.toFixed(2) }}</output>
      <input type="range" min="1" max="2" step="0.05" :value="st.lineHeight" @input="set('lineHeight', num($event))" />
    </label>
    <label>글자색 <input type="color" :value="st.color" @input="set('color', str($event))" /></label>

    <label>외곽선 <output>{{ st.outlineWidth.toFixed(2) }}</output>
      <input type="range" min="0" max="1" step="0.05" :value="st.outlineWidth" @input="set('outlineWidth', num($event))" />
    </label>
    <label>외곽선색 <input type="color" :value="st.outlineColor" @input="set('outlineColor', str($event))" /></label>
    <label class="check"><input type="checkbox" :checked="st.shadow" @change="set('shadow', ($event.target as HTMLInputElement).checked)" /> 그림자</label>

    <div class="seg full">
      <span>위치</span>
      <button :class="{ on: st.position === 'bottom' }" @click="set('position', 'bottom')">하단</button>
      <button :class="{ on: st.position === 'center' }" @click="set('position', 'center')">중앙</button>
    </div>
    <label v-if="st.position === 'bottom'">하단 여백 <output>{{ st.bottomMargin.toFixed(0) }}</output>
      <input type="range" min="0" max="40" step="1" :value="st.bottomMargin" @input="set('bottomMargin', num($event))" />
    </label>

    <div class="seg full">
      <span>배경</span>
      <button :class="{ on: st.background === 'black' }" @click="set('background', 'black')">검정 (루마키)</button>
      <button :class="{ on: st.background === 'green' }" @click="set('background', 'green')">초록 (크로마키)</button>
    </div>
    <div class="seg full">
      <span>전환</span>
      <button :class="{ on: st.transition === 'cut' }" @click="set('transition', 'cut')">컷</button>
      <button :class="{ on: st.transition === 'fade' }" @click="set('transition', 'fade')">페이드</button>
    </div>
    <label v-if="st.transition === 'fade'">페이드 ms <output>{{ st.fadeMs }}</output>
      <input type="range" min="100" max="1000" step="50" :value="st.fadeMs" @input="set('fadeMs', num($event))" />
    </label>

    <button class="reset full" @click="live.setStyle({ ...DEFAULT_STYLE })">기본값으로</button>
  </section>
</template>

<style scoped>
.style { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; font-size: 12px; }
h2 { grid-column: 1 / -1; margin: 0; font-size: 14px; }
label { display: grid; gap: 3px; color: var(--muted); }
label output { float: right; color: var(--text); }
label.check { display: flex; align-items: center; gap: 6px; }
.full { grid-column: 1 / -1; }
input[type='range'] { width: 100%; padding: 0; }
input[type='color'] { width: 100%; height: 28px; padding: 2px; }
.seg { display: flex; align-items: center; gap: 4px; }
.seg span { color: var(--muted); width: 36px; }
.seg button { flex: 1; padding: 4px; font-size: 12px; }
.seg button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.reset { font-size: 12px; }
</style>
