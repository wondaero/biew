/**
 * 출력 설정 수정본(저장 전). 모드 두 가지(체크박스 '바로 적용', 2026-11-22 사용자 결정 — 기기마다 기억, 기본 꺼짐):
 *  - 미리보기 후 저장(기본): 바꾸면 수정본만 바뀌고 송출은 그대로 — [저장]을 눌러야 송출에 나간다(2026-11-18 결정).
 *  - 바로 적용: 바꾸는 즉시 송출 화면(같은 PC 출력 창 + 인터넷 송출이면 넓은 화면 보기 기기)에 보인다.
 *    단 임시로만(상태·localStorage·서버에 안 남김, SyncTransport 'style-preview') — [저장]해야 확정,
 *    저장 안 하고 닫거나 [되돌리기]·새로고침·컨트롤러 꺼짐이면 원래 설정으로 돌아간다.
 *  - 기준 = 지금 저장된(송출 중인) 설정 live.state.style. 되돌리기 = 수정본 버리고 기준으로.
 *    (PC 패널은 늘 열려 있어 '연 시점'이 애매하므로 기준을 저장된 설정으로 통일)
 *  - 미리보기 모드에선 창을 닫아도 수정본이 남는다(닫기 ≠ 버리기). 새로고침·다른 채널로 가면 사라진다(메모리에만).
 *  - 저장 직후 '방금 저장 취소' 한 단계 되돌리기(예배 중 잘못 저장했을 때 한 번에 복구).
 *  - 보관(이름 붙여 목록에, stylePresets)과는 별개. 보관은 지금 보이는 설정(수정본이 있으면 수정본)을 담는다.
 */
import { ref, computed, watch } from 'vue'
import type { OutputStyle } from '@shared/types'
import { normalizeStyle, sameStyle } from '@shared/outputStyle'
import { useLive, sendStylePreview } from './liveStore'

const live = useLive()
/** null = 저장 안 된 변경 없음 */
const draft = ref<OutputStyle | null>(null)
/** 마지막 '저장' 직전의 송출 설정(한 단계 되돌리기용) */
const previous = ref<OutputStyle | null>(null)

// ── 모드: 바로 적용(기기마다 기억) ──
const MODE_KEY = 'biew.styleInstant.v1'
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === '1' } catch { return false } }
const instant = ref(readMode())
watch(instant, (v) => { try { v ? localStorage.setItem(MODE_KEY, '1') : localStorage.removeItem(MODE_KEY) } catch { /* 사생활 보호 모드 */ } })

const applied = computed(() => live.state.style)
/** 화면(설정 패널·미리보기)에 보이는 설정 */
const shown = computed<OutputStyle>(() => draft.value ?? applied.value)
const dirty = computed(() => draft.value !== null)
/** 지금 송출 화면에 실제로 보이는 설정 — 바로 적용 중이면 수정본(PGM 모니터도 이걸 그린다) */
const onAirStyle = computed<OutputStyle>(() => (instant.value && draft.value ? draft.value : applied.value))

function setDraft(next: OutputStyle) {
  // 저장된 설정과 같아지면 수정본 없음으로(되돌린 것과 같음)
  draft.value = sameStyle(next, applied.value) ? null : next
}

// 다른 채널로 가면(로컬 ↔ 인터넷 포함) 수정본·되돌리기 기록을 버린다
watch(() => live.channelCode.value, () => { draft.value = null; previous.value = null })

// ── 바로 적용: 임시 설정 보내기 ──
/** 송출 화면에 덮어 그릴 임시 설정(없으면 null) */
const override = computed<OutputStyle | null>(() => (instant.value && draft.value ? draft.value : null))
/** 방금 저장했으면 그 상태 version — 받는 쪽이 저장된 상태를 받은 뒤에 임시 설정을 끝내게 */
let savedVersion: number | undefined
let sending = false
watch(override, (s) => {
  if (s) { sending = true; sendStylePreview(s); return }
  if (!sending) return
  sending = false
  sendStylePreview(null, savedVersion)
  savedVersion = undefined
}, { deep: true })
// 살아 있다는 신호: 받는 쪽은 6초 동안 안 오면 스스로 끝낸다(stylePreview.ts)
if (typeof window !== 'undefined') {
  window.setInterval(() => { if (override.value) sendStylePreview(override.value) }, 2000)
  // 창을 닫거나 새로고침하면 저장 안 한 임시 설정은 끝
  window.addEventListener('pagehide', () => { if (override.value) sendStylePreview(null) })
}

export function useStyleDraft() {
  return {
    shown,
    dirty,
    instant,
    onAirStyle,
    canUndo: computed(() => previous.value !== null && !dirty.value),
    /** 일부 바꾸기 */
    patch<K extends keyof OutputStyle>(k: K, v: OutputStyle[K]) { setDraft({ ...shown.value, [k]: v }) },
    /** 통째로 바꾸기(기본값으로·보관한 설정 불러오기) — 미리보기 모드면 송출엔 아직 안 나감 */
    replace(s: OutputStyle) { setDraft(normalizeStyle(s)) },
    /** 저장: 수정본을 송출 설정으로 확정(한 번의 변경으로 전체 교체) */
    apply() {
      if (!draft.value) return
      previous.value = { ...applied.value }
      live.setStyle(draft.value)
      savedVersion = live.state.version
      draft.value = null
    },
    /** 수정본 버리기 → 저장된 설정으로 */
    revert() { draft.value = null },
    /** 설정 창·시트를 닫을 때: 바로 적용 중이면 저장 안 한 변경은 버린다(송출 화면도 원래대로). 미리보기 모드는 수정본 유지 */
    closed() { if (instant.value) draft.value = null },
    /** 마지막 저장 취소 → 그 전 송출 설정으로(바로 송출) */
    undo() {
      if (!previous.value) return
      live.setStyle(previous.value)
      previous.value = null
    },
  }
}
