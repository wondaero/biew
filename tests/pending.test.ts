import { describe, it, expect } from 'vitest'
import { classifyPending, isClean, diffIndex } from '../src/library/pending'
import type { PendingSong } from '../src/library/db'
import type { Song } from '../shared/types'

const song = (id: string, title: string, slides: string[], updated_at = '2026-11-01T00:00:00Z'): Song =>
  ({ id, title, slides, source_file: null, updated_at, deleted_at: null })
const server = [song('s1', 'Lorem Alpha', ['Lorem ipsum']), song('s2', 'Ipsum Beta', ['Sed do eiusmod'])]
const pnew = (id: string, title: string, slides: string[]): PendingSong => ({ id, kind: 'new', title, slides, base: null, savedAt: 'x' })
const pedit = (id: string, baseUpdated: string): PendingSong =>
  ({ id, kind: 'edit', title: 'Lorem Alpha', slides: ['Lorem ipsum fixed'], base: { updated_at: baseUpdated, title: 'Lorem Alpha', slides: ['Lorem ipsum'] }, savedAt: 'x' })

describe('서버에 올리기 — PC 변경 분류', () => {
  it('새 곡: 겹치는 곡이 없으면 문제 없음', () => {
    const i = classifyPending(pnew('local-1', 'Dolor Gamma', ['Ut enim']), server, [])
    expect(isClean(i)).toBe(true)
  })
  it('새 곡: 가사가 같은 서버 곡 / 제목이 같은 서버 곡을 찾는다', () => {
    expect(classifyPending(pnew('local-1', '다른 제목', ['Lorem ipsum']), server, []).dup.sameLyrics.map((s) => s.id)).toEqual(['s1'])
    expect(classifyPending(pnew('local-1', 'Ipsum Beta', ['Duis aute']), server, []).dup.sameTitle.map((s) => s.id)).toEqual(['s2'])
  })
  it('새 곡: 아직 안 올린 다른 PC 새 곡과의 중복도 찾는다', () => {
    const a = pnew('local-1', 'Dolor Gamma', ['Ut enim'])
    const b = pnew('local-2', 'Dolor Gamma', ['Duis aute'])
    expect(classifyPending(a, server, [a, b]).dup.sameTitle.map((s) => s.id)).toEqual(['local-2'])
  })
  it('수정: 고치는 동안 서버가 그대로면 문제 없음', () => {
    const i = classifyPending(pedit('s1', '2026-11-01T00:00:00Z'), server, [])
    expect(i.conflict).toBeNull()
    expect(isClean(i)).toBe(true)
  })
  it('수정: 고치는 동안 서버에서도 바뀌었으면 changed', () => {
    const changed = [song('s1', 'Lorem Alpha', ['Lorem ipsum (server)'], '2026-11-05T00:00:00Z'), server[1]!]
    const i = classifyPending(pedit('s1', '2026-11-01T00:00:00Z'), changed, [])
    expect(i.conflict).toBe('changed')
    expect(i.server?.slides).toEqual(['Lorem ipsum (server)'])
    expect(isClean(i)).toBe(false)
  })
  it('수정: 서버에서 삭제됐으면 deleted', () => {
    expect(classifyPending(pedit('gone', '2026-11-01T00:00:00Z'), server, []).conflict).toBe('deleted')
  })
})

describe('DB 와 이 기기 비교(다운로드 목록)', () => {
  const c = [{ id: 'a', updated_at: '1' }, { id: 'b', updated_at: '1' }, { id: 'ghost', updated_at: '1' }, { id: 'd', updated_at: '1' }]
  const r = [
    { id: 'a', updated_at: '1', deleted_at: null }, // 같음
    { id: 'b', updated_at: '2', deleted_at: null }, // DB 에서 수정
    { id: 'd', updated_at: '2', deleted_at: '2' }, // DB 에서 삭제
    { id: 'n', updated_at: '1', deleted_at: null }, // DB 에 새 곡
    { id: 'x', updated_at: '1', deleted_at: '1' }, // 이미 지워졌고 이 기기에도 없음 → 무시
  ]
  it('새 곡·수정·삭제·유령 곡(DB 에 아예 없음)', () => {
    const d = diffIndex(c, r)
    expect(Object.fromEntries(d.map((x) => [x.id, x.kind]))).toEqual({ b: 'changed', n: 'new', ghost: 'deleted', d: 'deleted' })
  })
  it('지우려는 곡은 새 곡 중복 후보에서 빠진다', () => {
    const del: PendingSong = { id: 's1', kind: 'delete', title: 'Lorem Alpha', slides: ['Lorem ipsum'], base: null, savedAt: 'x' }
    expect(classifyPending(pnew('local-1', 'X', ['Lorem ipsum']), server, [del]).dup.sameLyrics).toEqual([])
  })
})
