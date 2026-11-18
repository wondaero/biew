<script setup lang="ts">
/**
 * PC 출력 설정 팝업(사용자 결정 2026-11-18). 예전엔 오른쪽 패널에서 송출 모니터와 설정·미리보기가 한 줄에 쌓여 답답했다.
 *  - 왼쪽: 적용 전 미리보기(크게) + 적용/되돌리기, 그 아래 지금 송출 중(작게) — 비교용.
 *  - 오른쪽: 설정(스크롤). 규칙은 모바일 시트와 같다(src/live/styleDraft.ts): 바꾸면 수정본, [적용]을 눌러야 송출.
 *  - 열려 있는 동안 송출 단축키는 막고(hotkeysPaused) 팝업 단축키만: Esc = 닫기(수정본 유지), Ctrl/⌘+Enter = 적용.
 *    그냥 Enter 로 적용하지 않는 이유: 저장 이름을 입력하다 Enter 를 누르면 송출에 나가 버린다.
 *  - 뒤로가기 = 닫기(useBackClose). 모바일은 이 팝업 대신 바텀시트.
 */
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useLive } from '@/live/liveStore'
import { useStyleDraft } from '@/live/styleDraft'
import { onAir } from '@/live/nav'
import { useBackClose } from '@/lib/backClose'
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
onMounted(() => { live.hotkeysPaused.value = true; window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { live.hotkeysPaused.value = false; window.removeEventListener('keydown', onKey) })
</script>

<template>
  <div class="sd-backdrop" @mousedown.self="emit('close')">
    <div class="sd" role="dialog" aria-modal="true" aria-label="출력 설정">
      <header>
        <h2>출력 설정 <span v-if="draft.dirty.value" class="dirty-tag">적용 안 된 변경</span></h2>
        <small class="keys">Ctrl+Enter 적용 · Esc 닫기(고친 내용은 남음)</small>
        <span class="spacer" />
        <button class="quiet" title="닫기 (Esc) — 고친 내용은 남습니다" @click="emit('close')">✕</button>
      </header>
      <div class="sd-body">
        <section class="sd-left">
          <StylePreview class="sd-pv" />
          <div class="sd-air">
            <div class="sd-air-bar">지금 송출 중 <small>(비교용)</small></div>
            <div class="sd-air-screen">
              <SlideRender :text="air.text" :blank="air.blank" :style-cfg="live.state.style" :animate="false" />
            </div>
          </div>
        </section>
        <section class="sd-right">
          <StylePanel />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sd-backdrop { position: fixed; inset: 0; z-index: 45; display: grid; place-items: center; background: rgba(0, 0, 0, .6); }
.sd {
  width: min(1180px, calc(100vw - 48px)); height: min(820px, calc(100vh - 48px)); display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}
header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 16px; }
.keys { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
.dirty-tag { margin-left: 6px; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #dbe7ff; background: rgba(79, 140, 255, .25); vertical-align: middle; }
.sd-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); }
.sd-left { display: flex; flex-direction: column; gap: 16px; padding: 16px; overflow-y: auto; border-right: 1px solid var(--line); }
/* 적용 전 미리보기는 왼쪽 폭을 다 쓴다(StylePreview 기본은 화면 높이 26% 제한) */
.sd-pv :deep(.pv-screen) { width: 100%; }
.sd-air { display: grid; gap: 4px; width: min(100%, 320px); }
.sd-air-bar { font-size: 11px; font-weight: 600; color: var(--live); }
.sd-air-bar small { color: var(--muted); font-weight: normal; }
.sd-air-screen { aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.sd-right { min-height: 0; overflow-y: auto; padding: 14px 16px; }
/* 제목·'적용 안 된 변경' 표시는 팝업 머리에 있으므로 패널 안의 것은 숨김 */
.sd-right :deep(.style > h2) { display: none; }
</style>
