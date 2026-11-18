/**
 * 출력 설정 수정본(적용 전). 설정을 바꾸면 여기만 바뀌고 송출은 그대로 — '적용'을 눌러야 송출에 나간다(사용자 결정 2026-11-18).
 *  - 기준 = 지금 송출 중인(적용된) 설정 live.state.style. 되돌리기 = 수정본 버리고 기준으로.
 *    (PC 패널은 늘 열려 있어 '연 시점'이 애매하므로 기준을 송출 중 설정으로 통일)
 *  - 시트를 닫아도 수정본은 남는다(닫기 ≠ 버리기). 새로고침·다른 채널로 가면 사라진다(메모리에만 — 오래된 수정본이 나중에 실수로 적용되지 않게).
 *  - 적용 직후 '이전 설정으로' 한 단계 되돌리기(예배 중 잘못 적용했을 때 한 번에 복구).
 *  - 저장(이름 붙여 보관, stylePresets)과는 별개. 저장은 지금 보이는 설정(수정본이 있으면 수정본)을 보관한다.
 */
import { ref, computed, watch } from 'vue'
import type { OutputStyle } from '@shared/types'
import { normalizeStyle, sameStyle } from '@shared/outputStyle'
import { useLive } from './liveStore'

const live = useLive()
/** null = 적용 안 된 변경 없음 */
const draft = ref<OutputStyle | null>(null)
/** 마지막 '적용' 직전의 송출 설정(한 단계 되돌리기용) */
const previous = ref<OutputStyle | null>(null)

const applied = computed(() => live.state.style)
/** 화면(설정 패널·미리보기)에 보이는 설정 */
const shown = computed<OutputStyle>(() => draft.value ?? applied.value)
const dirty = computed(() => draft.value !== null)

function setDraft(next: OutputStyle) {
  // 송출 중 설정과 같아지면 수정본 없음으로(되돌린 것과 같음)
  draft.value = sameStyle(next, applied.value) ? null : next
}

// 다른 채널로 가면(로컬 ↔ 인터넷 포함) 수정본·되돌리기 기록을 버린다
watch(() => live.channelCode.value, () => { draft.value = null; previous.value = null })

export function useStyleDraft() {
  return {
    shown,
    dirty,
    canUndo: computed(() => previous.value !== null && !dirty.value),
    /** 일부 바꾸기 */
    patch<K extends keyof OutputStyle>(k: K, v: OutputStyle[K]) { setDraft({ ...shown.value, [k]: v }) },
    /** 통째로 바꾸기(기본값으로·저장된 설정 불러오기) — 송출엔 아직 안 나감 */
    replace(s: OutputStyle) { setDraft(normalizeStyle(s)) },
    /** 수정본을 송출에 내보낸다(한 번의 변경으로 전체 교체) */
    apply() {
      if (!draft.value) return
      previous.value = { ...applied.value }
      live.setStyle(draft.value)
      draft.value = null
    },
    /** 수정본 버리기 → 송출 중 설정으로 */
    revert() { draft.value = null },
    /** 마지막 적용 취소 → 그 전 송출 설정으로(바로 송출) */
    undo() {
      if (!previous.value) return
      live.setStyle(previous.value)
      previous.value = null
    },
  }
}
