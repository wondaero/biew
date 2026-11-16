import type { SyncMessage, SyncTransport } from './SyncTransport'

export class BroadcastChannelTransport implements SyncTransport {
  readonly name = 'broadcast-channel'
  private ch: BroadcastChannel
  private handlers = new Set<(m: SyncMessage) => void>()

  constructor(channel = 'biew-live') {
    this.ch = new BroadcastChannel(channel)
    this.ch.onmessage = (e: MessageEvent<SyncMessage>) => {
      for (const h of this.handlers) h(e.data)
    }
  }

  send(msg: SyncMessage): void {
    this.ch.postMessage(msg)
  }

  subscribe(handler: (m: SyncMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close(): void {
    this.handlers.clear()
    this.ch.close()
  }
}
