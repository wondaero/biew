<script setup lang="ts">
/**
 * 줄바꿈(\n)은 그대로 두고 자동 줄넘김 없이 그리되,
 * 화면을 넘치면 글자 크기를 이진 탐색으로 줄인다(최소 40%).
 * 40%로도 넘치면 그때만 자동 줄넘김 허용.
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import type { OutputStyle } from '@shared/types'

const props = defineProps<{ text: string; styleCfg: OutputStyle }>()
const box = ref<HTMLDivElement>()
const txt = ref<HTMLDivElement>()
const MIN_SCALE = 0.4

const boxStyle = computed(() => {
  const s = props.styleCfg
  return s.position === 'bottom'
    ? { justifyContent: 'flex-end', bottom: `${s.bottomMargin}cqh`, top: '5cqh' }
    : { justifyContent: 'center', bottom: '5cqh', top: '5cqh' }
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
  // 웹폰트 로딩 후 메트릭이 바뀌면 다시 맞춤
  document.fonts?.ready.then(() => fit())
})
onBeforeUnmount(() => ro?.disconnect())
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
  left: 4cqw;
  right: 4cqw;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}
.txt {
  text-align: center;
  white-space: pre;
  white-space-collapse: preserve-breaks;
  text-wrap-mode: nowrap;
  paint-order: stroke fill;
  max-width: 100%;
}
.txt.wrap { white-space: pre-line; text-wrap-mode: wrap; }
</style>
