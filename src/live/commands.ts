import type { LiveState } from '@shared/types'
import type { Command } from '@/sync/SyncTransport'

const SIMPLE = ['next', 'prev', 'nextSong', 'prevSong', 'blank'] as const

/**
 * 리모컨에서 온 원본 메시지를 검사해 허용된 명령만 돌려준다(그 외는 null).
 * 허용: 이동(다음/이전/곡 이동), 슬라이드 점프, BLANK. FREEZE·콘티·곡·스타일 변경은 리모컨에 권한이 없다.
 * 점프 좌표는 현재 콘티 범위 안이어야 한다.
 */
export function parseCommand(raw: unknown, state: Pick<LiveState, 'setlist'>): Command | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if ((SIMPLE as readonly unknown[]).includes(c.cmd)) return { cmd: c.cmd as (typeof SIMPLE)[number] }
  if (c.cmd === 'go') {
    const i = c.itemIndex
    const j = c.slideIndex
    if (typeof i !== 'number' || typeof j !== 'number' || !Number.isInteger(i) || !Number.isInteger(j)) return null
    const it = state.setlist[i]
    if (!it || j < 0 || j >= it.slides.length) return null
    return { cmd: 'go', itemIndex: i, slideIndex: j }
  }
  return null
}
