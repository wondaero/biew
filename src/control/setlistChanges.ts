/**
 * 오늘 선곡에서 고친 곡 — 임시 변경과 [저장](2026-11-25 사용자 결정).
 *  - 슬라이드 편집·나누기·삭제·복사·순서 바꾸기는 모두 오늘 선곡에만(임시). 곡 원본은 곡 제목 줄 [저장]을 눌러야 바뀐다.
 *  - "변경됨" = 지금 슬라이드 ≠ 넣을 때(또는 마지막 저장·↻ 최신 때)의 원본(SetlistItem.base).
 *    base 가 없는 예전 항목은 곡 목록의 원본과 비교한다.
 *  - 변경된 곡을 선곡에서 빼거나 선곡을 비우려 하면 [저장하고 제외] [버리고 제외] [취소] 를 묻는다(ExitChangedDialog).
 *  - [저장] 때 곡 원본이 그 사이 다른 곳에서 바뀌었으면(곡 목록의 원본 ≠ base) 덮어쓸지 묻는다.
 * 저장 = 이 기기(곡 저장 규칙 — DB 엔 곡 목록의 ⬆ 업로드로).
 */
import { ref } from 'vue'
import type { SetlistItem } from '@shared/types'
import { itemFingerprint } from '@shared/history'
import { isMediaItem } from '@shared/media'
import { useLive } from '@/live/liveStore'
import { useLibrary, loadCache, saveSong } from '@/library/library'

const live = useLive()
const lib = useLibrary()

/** 오늘 선곡에서 고쳐서 곡 원본과 달라졌는지(그림 묶음은 해당 없음) */
export function isChanged(it: SetlistItem): boolean {
  if (isMediaItem(it)) return false
  const now = itemFingerprint(it)
  if (it.base) return now !== it.base
  const song = lib.byId.value.get(it.songId)
  return !!song && itemFingerprint(song) !== now
}

export type SaveItemResult = { ok: true; text: string } | { ok: false; text: string; cancelled?: boolean }

/** 지금 슬라이드를 곡 원본에 저장 */
export async function saveItemToSong(it: SetlistItem): Promise<SaveItemResult> {
  await loadCache()
  const song = lib.byId.value.get(it.songId)
  if (!song) return { ok: false, text: `"${it.title}" 은(는) 이 기기의 곡 목록에 없어 원본에 저장할 수 없습니다 — 곡 목록에서 새 곡으로 등록하세요` }
  if (it.base && itemFingerprint(song) !== it.base
    && !confirm(`"${it.title}" 곡 원본이 그 사이 다른 곳에서 바뀌었습니다.\n오늘 선곡의 내용으로 덮어쓸까요?`)) {
    return { ok: false, text: '저장하지 않았습니다', cancelled: true }
  }
  try {
    await saveSong({ id: song.id, title: song.title, slides: [...it.slides], base: { updated_at: song.updated_at, title: song.title, slides: [...song.slides] } })
  } catch (e) {
    return { ok: false, text: `저장하지 못했습니다: ${e instanceof Error ? e.message : e}` }
  }
  live.setlist.markSaved(it.key)
  return { ok: true, text: `"${it.title}" 곡 원본에 저장했습니다(이 기기 — DB 엔 곡 목록의 ⬆ 업로드로)` }
}

// ── 변경된 곡을 뺄 때 묻기(ExitChangedDialog 가 그린다 — ControlView 에 하나) ──
export type ExitChoice = 'save' | 'discard' | 'cancel'
export interface ExitRequest { items: SetlistItem[]; onAir: boolean; all: boolean; resolve: (c: ExitChoice) => void }
export const exitRequest = ref<ExitRequest | null>(null)
function askExit(items: SetlistItem[], onAir: boolean, all: boolean): Promise<ExitChoice> {
  exitRequest.value?.resolve('cancel')
  return new Promise((resolve) => { exitRequest.value = { items, onAir, all, resolve } })
}

/** 저장할 것들 저장 — 하나라도 실패·취소면 false(빼지 않음) */
async function saveAll(items: SetlistItem[]): Promise<{ ok: boolean; text: string }> {
  for (const it of items) {
    const r = await saveItemToSong(it)
    if (!r.ok) return { ok: false, text: r.text }
  }
  return { ok: true, text: items.length > 1 ? `${items.length}곡을 원본에 저장했습니다` : '원본에 저장했습니다' }
}

/** 선곡 제외(한 곡). 결과 알림 문구(없으면 null). 변경됐으면 묻고, 송출 중이면 그것도 알린다 */
export async function removeItemAsk(it: SetlistItem): Promise<{ text: string; warn?: boolean } | null> {
  const i = live.state.setlist.findIndex((x) => x.key === it.key)
  if (i < 0) return null
  const onAir = i === live.state.itemIndex
  if (!isChanged(it)) {
    const msg = onAir ? `송출 중인 "${it.title}"을(를) 선곡에서 뺄까요? 자막이 내려갑니다.\n곡 목록의 곡은 그대로입니다.` : `"${it.title}"을(를) 선곡에서 뺄까요?\n곡 목록의 곡은 그대로입니다.`
    if (!confirm(msg)) return null
    live.setlist.remove(it.key)
    return null
  }
  const c = await askExit([it], onAir, false)
  if (c === 'cancel') return null
  if (c === 'save') {
    const r = await saveAll([it])
    if (!r.ok) return { text: r.text, warn: true }
    live.setlist.remove(it.key)
    return { text: `${r.text} — 선곡에서 뺐습니다` }
  }
  live.setlist.remove(it.key)
  return { text: '고친 내용은 버리고 선곡에서 뺐습니다' }
}

/** 선곡 비우기. 변경된 곡이 있으면 묻는다 */
export async function clearAsk(): Promise<{ text: string; warn?: boolean } | null> {
  const changed = live.state.setlist.filter(isChanged)
  if (!changed.length) {
    if (confirm('선곡을 모두 비울까요?')) live.setlist.clear()
    return null
  }
  const c = await askExit(changed, live.state.setlist.length > 0, true)
  if (c === 'cancel') return null
  if (c === 'save') {
    const r = await saveAll(changed)
    if (!r.ok) return { text: r.text, warn: true }
    live.setlist.clear()
    return { text: `${r.text} — 선곡을 비웠습니다` }
  }
  live.setlist.clear()
  return { text: '고친 내용은 버리고 선곡을 비웠습니다' }
}
