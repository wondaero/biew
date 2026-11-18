<script setup lang="ts">
/**
 * 줄바꿈(\n)은 그대로 두고 자동 줄넘김 없이 그리되,
 * 글은 (왼쪽 여백, 위 여백)에서 시작(왼쪽 정렬). 영역 = 그 지점부터 화면 오른쪽·아래 끝까지.
 * 영역을 넘치면 글자 크기를 이진 탐색으로 줄인다(최소 20%).
 * 20%로도 넘치면 그때만 자동 줄넘김 허용.
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { DEFAULT_STYLE, type OutputStyle } from '@shared/types'

const props = defineProps<{ text: string; styleCfg: OutputStyle }>()
const box = ref<HTMLDivElement>()
const txt = ref<HTMLDivElement>()
// 10줄까지 한 화면에 들어가도록 낮게 둔다(글자 크기 7 기준 10줄 ≈ 94cqh)
const MIN_SCALE = 0.2

const boxStyle = computed(() => {
  const s = props.styleCfg
  // 'center' 가 아니면 모두 상단 기준(예전 'bottom' 값이 섞여 들어와도 안전)
  // 여백은 위·왼쪽만. 오른쪽·아래는 화면 끝까지(넘치면 글자 축소)
  const left = `${s.leftMargin ?? DEFAULT_STYLE.leftMargin}cqw`
  return s.position === 'center'
    ? { justifyContent: 'center', top: '0', bottom: '0', left }
    : { justifyContent: 'flex-start', top: `${s.topMargin ?? DEFAULT_STYLE.topMargin}cqh`, bottom: '0', left }
})

const textStyle = computed(() => {
  const s = props.styleCfg
  return {
    fontFamily: s.fontFamily,
    fontWeight: String(s.fontWeight),
    lineHeight: String(s.lineHeight),
    color: s.color,
    WebkitTextStroke: s.outlineWidth > 0 ? `${s.outlineWidth * 2}cqh ${s.outlineColor}` : undefined,
    textShadow: s.shadow ? '0 0.3cqh 0.9cqh rgba(0,0,0,.85)' : 'none',
  }
})

function fits(b: HTMLElement, t: HTMLElement) {
  return t.scrollHeight <= b.clientHeight + 1 && t.scrollWidth <= b.clientWidth + 1
}

function fit() {
  const b = box.value, t = txt.value
  if (!b || !t || b.clientHeight === 0) return
  const base = props.styleCfg.fontSize
  t.classList.remove('wrap')
  const apply = (k: number) => { t.style.fontSize = `${base * k}cqh` }
  apply(1)
  if (fits(b, t)) return
  let lo = MIN_SCALE, hi = 1
  apply(lo)
  if (!fits(b, t)) { t.classList.add('wrap'); return }
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    apply(mid)
    if (fits(b, t)) lo = mid
    else hi = mid
  }
  apply(lo)
}

let ro: ResizeObserver | undefined
onMounted(() => {
  fit()
  ro = new ResizeObserver(() => fit())
  if (box.value) ro.observe(box.value)
  // 웹폰트(Pretendard) 로딩 후 메트릭이 바뀌면 다시 맞춤. 글꼴은 처음 쓰일 때 로드되므로
  // ready(지금 시점) 하나로는 부족 — 나중에 끝나는 로딩(loadingdone)도 받는다
  document.fonts?.ready.then(() => fit())
  document.fonts?.addEventListener?.('loadingdone', onFontsLoaded)
})
const onFontsLoaded = () => fit()
onBeforeUnmount(() => { ro?.disconnect(); document.fonts?.removeEventListener?.('loadingdone', onFontsLoaded) })
watch(() => [props.text, props.styleCfg], () => nextTick(fit), { deep: true })
</script>

<template>
  <div ref="box" class="box" :style="boxStyle">
    <div ref="txt" class="txt" :style="textStyle">{{ text }}</div>
  </div>
</template>

<style scoped>
.box {
  position: absolute;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow: hidden;
}
.txt {
  text-align: left;
  white-space: pre;
  white-space-collapse: preserve-breaks;
  text-wrap-mode: nowrap;
  paint-order: stroke fill;
  max-width: 100%;
}
.txt.wrap { white-space: pre-line; text-wrap-mode: wrap; }
</style>
