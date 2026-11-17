import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { SyncMessage, SyncTransport } from './SyncTransport'

/**
 * Supabase Realtime Broadcast 경로. 채널 이름: ch:<topic>
 * topic 은 채널 번호가 아니라 서버(RPC)가 비밀번호 확인 후에만 내주는 추측 불가 토큰이다 → 번호만으로는 연결할 수 없다.
 * (채널당 control topic = 리모컨↔호스트(명령 + 리모컨용 상태), view topic = 호스트→보는 기기 상태)
 * 끊김/재연결은 supabase-js 가 처리. 끊겨 있는 동안의 send 는 버려지고, 받는 쪽은 재연결 시 join RPC 로 따라잡는다.
 */
export class SupabaseRealtimeTransport implements SyncTransport {
  readonly name = 'supabase-realtime'
  private ch: RealtimeChannel
  private handlers = new Set<(m: SyncMessage) => void>()

  constructor(
    private sb: SupabaseClient,
    topic: string,
    opts: { sendOnly?: boolean; onStatus?: (status: string) => void } = {},
  ) {
    this.ch = sb.channel(`ch:${topic}`, { config: { broadcast: { self: false, ack: false } } })
    if (!opts.sendOnly) {
      this.ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
        for (const h of this.handlers) h(payload as SyncMessage)
      })
    }
    this.ch.subscribe((status) => opts.onStatus?.(status))
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
    // unsubscribe 만 하면 클라이언트 목록에 남는다. supabase-js 는 같은 이름으로 channel() 을 부르면
    // 기존 인스턴스를 돌려주므로(재연결·재입장 시) '이미 구독한 채널을 다시 구독' 예외가 날 수 있다 → 완전히 제거.
    void this.sb.removeChannel(this.ch)
  }
}
