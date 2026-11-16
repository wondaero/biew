import { describe, it, expect } from 'vitest'
import { SyncHub } from '../src/sync/SyncHub'
import type { SyncMessage, SyncTransport } from '../src/sync/SyncTransport'
import { emptyLiveState, nextVersion, type LiveState } from '../shared/types'

class FakeTransport implements SyncTransport {
  name = 'fake'; sent: SyncMessage[] = []; h = new Set<(m: SyncMessage) => void>()
  send(m: SyncMessage) { this.sent.push(m) }
  subscribe(f: (m: SyncMessage) => void) { this.h.add(f); return () => this.h.delete(f) }
  emit(m: SyncMessage) { this.h.forEach((f) => f(m)) }
  close() {}
}
const st = (version: number, origin = 'a'): LiveState => ({ ...emptyLiveState(origin), version })

describe('SyncHub', () => {
  it('더 큰 version 만 반영, 두 경로 중복 수신은 한 번만', () => {
    const t1 = new FakeTransport(), t2 = new FakeTransport()
    const got: number[] = []
    new SyncHub([t1, t2], (s) => got.push(s.version))
    t1.emit({ type: 'state', state: st(5) })
    t2.emit({ type: 'state', state: st(5) }) // 같은 상태가 다른 경로로
    t1.emit({ type: 'state', state: st(3) }) // 역전된 옛 상태
    t2.emit({ type: 'state', state: st(7) })
    expect(got).toEqual([5, 7])
  })
  it('send 는 모든 transport 로', () => {
    const t1 = new FakeTransport(), t2 = new FakeTransport()
    new SyncHub([t1, t2], () => {}).send({ type: 'request-state', from: 'x' })
    expect(t1.sent.length + t2.sent.length).toBe(2)
  })
  it('nextVersion 은 항상 증가 (컨트롤러 재시작 후에도 Date.now 이상)', () => {
    expect(nextVersion(5)).toBeGreaterThanOrEqual(Date.now() - 1)
    const far = Date.now() + 10_000
    expect(nextVersion(far)).toBe(far + 1)
  })
})
