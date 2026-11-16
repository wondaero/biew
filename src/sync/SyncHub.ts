import { isNewer, type LiveState } from '@shared/types'
import type { SyncMessage, SyncTransport } from './SyncTransport'

/**
 * 여러 transport 를 묶는다. 보낼 땐 전부로, 받을 땐 version 으로 중복/역전 제거.
 * Phase 2 에서 Realtime 이 끊겨도 BroadcastChannel 경로는 독립적으로 동작한다.
 */
export class SyncHub {
  private latest: Pick<LiveState, 'version' | 'origin'> | null = null
  private unsubs: (() => void)[] = []

  constructor(
    private transports: SyncTransport[],
    private onState: (s: LiveState) => void,
    private onOther: (m: Exclude<SyncMessage, { type: 'state' }>) => void = () => {},
  ) {
    for (const t of transports) {
      this.unsubs.push(
        t.subscribe((m) => {
          if (m.type === 'state') this.receive(m.state)
          else this.onOther(m)
        }),
      )
    }
  }

  /** 로컬에서 만든 상태도 기준점으로 기록(자기 메시지 재수신 무시) */
  mark(s: Pick<LiveState, 'version' | 'origin'>) {
    if (isNewer(s, this.latest)) this.latest = { version: s.version, origin: s.origin }
  }

  receive(s: LiveState): boolean {
    if (!isNewer(s, this.latest)) return false
    this.mark(s)
    this.onState(s)
    return true
  }

  send(m: SyncMessage) {
    for (const t of this.transports) {
      try { t.send(m) } catch (e) { console.warn(`[sync] ${t.name} send 실패`, (e as Error).message) }
    }
  }

  close() {
    this.unsubs.forEach((u) => u())
    this.transports.forEach((t) => t.close())
  }
}
