<script setup lang="ts">
/**
 * PC 사이드바, 송출 화면 아래 한 줄: 지금 송출 중인 출력 설정 요약 + [⚙ 출력 설정](팝업).
 *  - 송출 중 설정과 같은 저장된 설정이 있으면 그 이름(리허설 때 '지금 어떤 설정이 나가지?'), 없으면 글꼴·크기·배경.
 *  - 자세한 값은 마우스를 올리면(title). 적용 안 된 수정본이 있으면 표시·버튼 강조(styleDraft).
 */
import { computed } from 'vue'
import { useLive } from '@/live/liveStore'
import { useStyleDraft } from '@/live/styleDraft'
import { presets } from '@/live/stylePresets'
import { sameStyle } from '@shared/outputStyle'
import { toBackdrop, keyable } from '@shared/backdrop'

const emit = defineEmits<{ open: [] }>()
const live = useLive()
const draft = useStyleDraft()
const st = computed(() => live.state.style)

const WEIGHT: Record<number, string> = { 400: '보통', 700: '굵게', 800: '아주 굵게' }
const hex = (c: string) => c.toUpperCase()
const fontName = computed(() => (st.value.fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim() || '기본')
const backdrop = computed(() => {
  const b = toBackdrop(st.value.backdrop)
  const k = keyable(b)
  if (k === 'luma') return '검정(루마키)'
  if (k === 'chroma') return '초록(크로마키)'
  return b.kind === 'solid' ? `단색 ${hex(b.color)}` : `그라데이션 ${hex(b.from)}→${hex(b.to)}`
})
const presetName = computed(() => presets.value.find((p) => sameStyle(p.style, st.value))?.name ?? null)
const short = computed(() => `${fontName.value} ${st.value.fontSize.toFixed(1)} · ${backdrop.value}`)
/** 마우스를 올리면 보이는 자세한 값 */
const detail = computed(() => {
  const s = st.value
  return [
    `글꼴: ${fontName.value} · ${WEIGHT[s.fontWeight] ?? s.fontWeight} · 크기 ${s.fontSize.toFixed(1)} · 줄 간격 ${s.lineHeight.toFixed(2)}`,
    `글자: ${hex(s.color)} · 외곽선 ${s.outlineWidth > 0 ? `${s.outlineWidth.toFixed(2)} ${hex(s.outlineColor)}` : '없음'} · 그림자 ${s.shadow ? '켬' : '끔'}`,
    `위치: ${s.position === 'center' ? `세로 중앙 (왼쪽 ${s.leftMargin})` : `위 기준 (위 ${s.topMargin} · 왼쪽 ${s.leftMargin})`}`,
    `배경: ${backdrop.value} · 전환: ${s.transition === 'fade' ? `페이드 ${s.fadeMs}ms` : '컷'}`,
  ].join('\n')
})
</script>

<template>
  <section class="style-sum" :title="`지금 송출 중인 출력 설정\n${detail}`">
    <span class="ss-k">출력</span>
    <span v-if="presetName" class="ss-preset">● {{ presetName }}</span>
    <span v-else class="ss-line">{{ short }}</span>
    <button :class="{ dirty: draft.dirty.value }" :title="draft.dirty.value ? '적용 안 된 변경 있음 — 열어서 [적용]' : '출력 설정 열기'" @click="emit('open')">⚙ 설정<i v-if="draft.dirty.value" class="dot" /></button>
  </section>
</template>

<style scoped>
.style-sum { display: flex; align-items: center; gap: 8px; font-size: 12px; min-width: 0; }
.ss-k { color: var(--muted); flex: none; }
.ss-line, .ss-preset { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-preset { color: var(--live); font-weight: 600; }
button { flex: none; margin-bottom: 0; font-size: 14px; white-space: nowrap; }
button.dirty { color: #dbe7ff; border-color: var(--preview); }
.dot { display: inline-block; width: 7px; height: 7px; margin-left: 5px; border-radius: 50%; background: var(--preview); vertical-align: middle; }
</style>
