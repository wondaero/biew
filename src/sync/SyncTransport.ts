import type { LiveState } from '@shared/types'

export type SyncMessage =
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
