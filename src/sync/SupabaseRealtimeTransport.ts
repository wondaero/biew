import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { SyncMessage, SyncTransport } from './SyncTransport'

/**
 * Supabase Realtime Broadcast 경로. 채널: room:<CODE>
 * - 컨트롤러는 sendOnly 로 사용(수신하지 않음) → 방코드를 아는 사람이 가짜 상태를 보내도 송출에 영향 없음
 * - 뷰어는 수신만
 * 끊김/재연결은 supabase-js 가 처리. 끊겨 있는 동안의 send 는 버려지고, 뷰어는 재연결 시 get_room 으로 따라잡는다.
 */
export class SupabaseRealtimeTransport implements SyncTransport {
  readonly name = 'supabase-realtime'
  private ch: RealtimeChannel
  private handlers = new Set<(m: SyncMessage) => void>()
  readonly ready: Promise<void>

  constructor(
    sb: SupabaseClient,
    code: string,
    opts: { sendOnly?: boolean; onStatus?: (status: string) => void } = {},
  ) {
    this.ch = sb.channel(`room:${code}`, { config: { broadcast: { self: false, ack: false } } })
    if (!opts.sendOnly) {
      this.ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
        for (const h of this.handlers) h(payload as SyncMessage)
      })
    }
    this.ready = new Promise((resolve) => {
      this.ch.subscribe((status) => {
        opts.onStatus?.(status)
        if (status === 'SUBSCRIBED') resolve()
      })
    })
  }

  send(msg: SyncMessage): void {
    void this.ch.send({ type: 'broadcast', event: 'msg', payload: msg })
  }

  subscribe(handler: (m: SyncMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close(): void {
    this.handlers.clear()
    void this.ch.unsubscribe()
  }
}
