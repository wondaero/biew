import type { LiveState } from '@shared/types'

/**
 * 송출 조작 명령. 상태를 통째로 보내지 않고 '조작'만 보낸다.
 * 인터넷 송출의 폰 리모컨은 이걸 서버(remote_command)로 보내고, 서버가 허용 목록·범위를 검사해 적용한다
 * (같은 규칙의 앱 쪽 검사: live/commands.ts — 검증 스크립트가 둘을 대조).
 */
export type Command =
  | { cmd: 'next' | 'prev' | 'nextSong' | 'prevSong' | 'blank' }
  | { cmd: 'go'; itemIndex: number; slideIndex: number }

export type SyncMessage =
  /** 상태(또는 '바뀌었다'는 알림 — 인터넷 송출 호스트는 내용을 믿지 않고 서버에서 다시 읽는다) */
  | { type: 'state'; state: LiveState }
  /** 출력 창이 열리거나 새로고침될 때 현재 상태 요청 */
  | { type: 'request-state'; from: string }
  /** 출력 창 생존 신호 (컨트롤러에 '출력 연결됨' 표시용) */
  | { type: 'output-alive'; from: string }

/**
 * 동기화 경로 추상화.
 * Phase 1: BroadcastChannelTransport (같은 PC 창끼리)
 * Phase 2: SupabaseRealtimeTransport 를 추가하고 SyncHub 에 함께 붙인다.
 */
export interface SyncTransport {
  readonly name: string
  send(msg: SyncMessage): void
  subscribe(handler: (msg: SyncMessage) => void): () => void
  close(): void
}
