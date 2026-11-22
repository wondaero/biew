<script setup lang="ts">
/**
 * PC 출력 설정 팝업(사용자 결정 2026-11-18). 예전엔 오른쪽 패널에서 송출 모니터와 설정·미리보기가 한 줄에 쌓여 답답했다.
 *  - 왼쪽(보는 곳): 저장 전 미리보기(크게), 그 아래 저장된 설정 — 비교용.
 *  - 오른쪽(만지는 곳): 설정(스크롤) + 맨 아래 고정 줄 [기본값으로] … [되돌리기][저장] — 버튼은 설정 가까이(사용자 요청).
 *    기본값으로는 위험 동작이라 왼쪽 끝에 따로(저장 옆에 두면 잘못 누르기 쉬움). 규칙은 모바일 시트와 같다(src/live/styleDraft.ts):
 *    미리보기 모드 = 바꾸면 수정본, [저장]을 눌러야 송출 / 바로 적용 모드 = 송출 화면에 바로, [저장]해야 유지.
 *  - 열려 있는 동안 송출 단축키는 막고(hotkeysPaused) 팝업 단축키만: Esc = 닫기, Ctrl/⌘+Enter = 저장.
 *    닫으면 미리보기 모드는 수정본 유지, 바로 적용 모드는 저장 안 한 변경을 버린다(송출 화면도 원래대로 — draft.closed).
 *    그냥 Enter 로 저장하지 않는 이유: 보관 이름을 입력하다 Enter 를 누르면 송출에 나가 버린다.
 *  - 뒤로가기 = 닫기(useBackClose). 모바일은 이 팝업 대신 바텀시트.
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { DEFAULT_STYLE } from '@shared/types'
import { useLive } from '@/live/liveStore'
import { useStyleDraft } from '@/live/styleDraft'
import { onAir } from '@/live/nav'
import { useBackClose } from '@/lib/backClose'
import { usePauseHotkeys } from './usePauseHotkeys'
import SlideRender from '@/components/SlideRender.vue'
import StylePanel from './panels/StylePanel.vue'
import StylePreview from './panels/StylePreview.vue'

const emit = defineEmits<{ close: [] }>()
const live = useLive()
const draft = useStyleDraft()
const air = computed(() => onAir(live.state))

useBackClose(() => true, () => emit('close'))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close') }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); draft.apply() }
}
usePauseHotkeys()
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); draft.closed() })
</script>

<template>
  <div class="sd-backdrop" @mousedown.self="emit('close')">
    <div class="sd" role="dialog" aria-modal="true" aria-label="출력 설정">
      <header>
        <h2>출력 설정 <span v-if="draft.dirty.value" class="dirty-tag" :class="{ inst: draft.instant.value }">{{ draft.instant.value ? '저장 전 — 송출 화면에 보이는 중' : '저장 안 된 변경' }}</span></h2>
        <small class="keys">Ctrl+Enter 저장 · Esc 닫기{{ draft.instant.value ? '(저장 안 한 변경은 되돌아감)' : '(고친 내용은 남음)' }}</small>
        <span class="spacer" />
        <button class="quiet" :title="draft.instant.value ? '닫기 (Esc) — 저장 안 한 변경은 되돌아갑니다' : '닫기 (Esc) — 고친 내용은 남습니다'" @click="emit('close')">✕</button>
      </header>
      <div class="sd-body">
        <section class="sd-left">
          <StylePreview class="sd-pv" :actions="false" :toggle="false" />
          <div class="sd-air">
            <div class="sd-air-bar">{{ draft.instant.value ? '저장된 설정' : '지금 송출 중' }} <small>{{ draft.instant.value ? '(저장 안 하고 닫으면 이걸로 돌아감)' : '(비교용)' }}</small></div>
            <div class="sd-air-screen">
              <SlideRender :text="air.text" :blank="air.blank" :style-cfg="live.state.style" :animate="false" />
            </div>
          </div>
        </section>
        <section class="sd-right">
          <div class="sd-scroll"><StylePanel /></div>
          <footer class="sd-foot">
            <button class="danger-line" title="기본값으로 바꾸기([저장]해야 확정)" @click="draft.replace({ ...DEFAULT_STYLE })">기본값으로</button>
            <span class="spacer" />
            <template v-if="draft.dirty.value">
              <button class="revert" title="고친 것을 버리고 저장된 설정으로" @click="draft.revert()">되돌리기</button>
              <button class="apply" title="이 설정으로 송출 확정 (Ctrl+Enter)" @click="draft.apply()">저장</button>
            </template>
            <button v-else-if="draft.canUndo.value" class="undo" title="방금 저장한 것을 취소하고 그 전 설정으로(바로 송출)" @click="draft.undo()">↶ 방금 저장 취소</button>
            <small v-else class="foot-hint">바꾸면 여기서 [저장]</small>
          </footer>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sd-backdrop { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.sd {
  width: min(1440px, calc(100vw - 48px)); height: min(1000px, calc(100vh - 48px)); /* 큰 화면에선 미리보기 두 개를 더 크게 */ display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}
header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 16px; }
.keys { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
.dirty-tag { margin-left: 6px; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #dbe7ff; background: rgba(79, 140, 255, .25); vertical-align: middle; }
.dirty-tag.inst { color: #c9f5d9; background: rgba(46, 204, 113, .22); }
.sd-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); }
/*
 * 왼쪽(보는 곳): 위 = 적용 전 미리보기, 아래 = 지금 송출 중 — 같은 크기(1:1)로, 둘 다 팝업 높이 안에(스크롤 없음, 사용자 요청).
 * 각 칸을 크기 컨테이너로 두고 화면 폭 = min(칸 폭, (칸 높이 - 이름 줄) × 16/9) → 넓으면 높이에, 좁으면 폭에 맞춘다.
 */
.sd-left { display: grid; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; padding: 14px 16px; overflow: hidden; border-right: 1px solid var(--line); }
.sd-pv, .sd-air { container-type: size; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
.sd-pv :deep(.pv-screen), .sd-air-screen { width: min(100cqw, calc((100cqh - 22px) * 16 / 9)); aspect-ratio: 16 / 9; margin: 0 auto; }
.sd-air-bar { font-size: 11px; font-weight: 600; color: var(--live); }
.sd-air-bar small { color: var(--muted); font-weight: normal; }
.sd-air-screen { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.sd-right { min-height: 0; display: flex; flex-direction: column; }
.sd-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; }
/* 버튼 줄: 설정을 스크롤해도 항상 보이게 아래에 고정 */
.sd-foot { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); background: var(--panel); }
.sd-foot button { margin-bottom: 0; padding: 8px 12px; }
.sd-foot .apply { --edge: #12803b; background-color: var(--live); border-color: #4be080; color: var(--live-ink); font-weight: 700; }
.sd-foot .apply:hover { background-color: #34d36b; border-color: #5fe891; }
.sd-foot .undo { color: var(--muted); }
.foot-hint { color: var(--muted); font-size: 12px; }
/* 패널 안의 기본값으로 버튼은 숨김(아래 버튼 줄에 있음) */
.sd-right :deep(.reset) { display: none; }
/* 제목·'적용 안 된 변경' 표시는 팝업 머리에 있으므로 패널 안의 것은 숨김 */
.sd-right :deep(.style > h2) { display: none; }
</style>
