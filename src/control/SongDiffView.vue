<script setup lang="ts">
/**
 * 곡 두 버전의 다른 곳만 보여 줌(shared/songDiff.ts) — 다운로드·업로드 화면 공용.
 * a = 지금(바꾸기 전), b = 바꾼 뒤. 같은 장은 접어서 "같은 장 N개"로. 바뀐 줄은 다른 글자만 강조(빨강 = 빠짐, 초록 = 들어옴).
 * a 가 없으면 b 전체(새 곡), b 가 없으면 a 전체(삭제).
 */
import { computed } from 'vue'
import { diffSongs } from '@shared/songDiff'

type V = { title: string; slides: readonly string[] } | null
const props = defineProps<{ a: V; b: V; aLabel: string; bLabel: string }>()
const d = computed(() => (props.a && props.b ? diffSongs(props.a, props.b) : null))
const same = computed(() => d.value?.slides.filter((s) => s.kind === 'same').length ?? 0)
const whole = computed(() => props.b ?? props.a)
</script>

<template>
  <div class="sdv">
    <p class="legend"><del>{{ aLabel }}</del> → <ins>{{ bLabel }}</ins></p>
    <template v-if="d">
      <p v-if="d.title" class="row"><b>제목</b> <del>{{ d.title.a }}</del> → <ins>{{ d.title.b }}</ins></p>
      <template v-for="(s, i) in d.slides" :key="i">
        <div v-if="s.kind === 'changed'" class="slide">
          <b>{{ s.b + 1 }}장</b>
          <div v-for="(l, k) in s.lines" :key="k" class="ln" :class="l.kind">
            <template v-if="l.kind === 'changed'">{{ l.seg.pre }}<del>{{ l.seg.a }}</del><ins>{{ l.seg.b }}</ins>{{ l.seg.suf }}</template>
            <template v-else-if="l.kind === 'added'"><ins>{{ l.text }}</ins></template>
            <template v-else-if="l.kind === 'removed'"><del>{{ l.text }}</del></template>
            <template v-else>{{ l.text }}</template>
          </div>
        </div>
        <div v-else-if="s.kind === 'added'" class="slide"><b>{{ s.b + 1 }}장 추가</b><pre><ins>{{ s.text }}</ins></pre></div>
        <div v-else-if="s.kind === 'removed'" class="slide"><b>{{ s.a + 1 }}장 삭제</b><pre><del>{{ s.text }}</del></pre></div>
      </template>
      <p v-if="same" class="same">같은 장 {{ same }}개는 생략</p>
      <p v-if="!d.count" class="same">내용이 같습니다(수정 시각만 다름)</p>
    </template>
    <template v-else-if="whole">
      <p class="row"><b>{{ whole.title }}</b> · {{ whole.slides.length }}장</p>
      <pre :class="{ gone: !b }">{{ whole.slides.join('\n\n') }}</pre>
    </template>
  </div>
</template>

<style scoped>
.sdv { display: grid; gap: 8px; padding: 10px; background: var(--bg); border-radius: 6px; font-size: 13px; max-height: 360px; overflow: auto; }
.legend, .row, .same { margin: 0; }
.legend { font-size: 11px; color: var(--muted); }
.same { font-size: 12px; color: var(--muted); }
.slide { display: grid; gap: 2px; }
.slide b { font-size: 12px; color: var(--muted); }
.ln { white-space: pre-wrap; line-height: 1.55; }
.ln.same { color: var(--muted); }
pre { margin: 0; white-space: pre-wrap; font: inherit; line-height: 1.55; }
pre.gone { color: var(--muted); text-decoration: line-through; }
del { background: rgba(255, 59, 59, .22); color: #ffb3b3; text-decoration: line-through; border-radius: 2px; }
ins { background: rgba(34, 197, 94, .22); color: #b9f5cf; text-decoration: none; border-radius: 2px; }
.legend del, .legend ins { padding: 0 4px; }
</style>
