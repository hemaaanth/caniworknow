import { describe, expect, it } from 'vitest'
import type { LiveStatusResponse } from '../src/lib/status.js'
import {
  compactSnapshotUrl,
  createCompactStatusSnapshot,
  isCompactSnapshotToken,
  parseCompactStatusSnapshot,
} from './snapshot-compact.js'

const SECRET = 'a-stable-test-secret-with-32-characters'
const status: LiveStatusResponse = {
  answer: 'no',
  checkedAt: '2026-08-18T03:51:52.250Z',
  services: [
    { id: 'github', name: 'GitHub', health: 'operational', detail: 'Operational', sources: [], links: [] },
    { id: 'cloudflare', name: 'Cloudflare', health: 'degraded', detail: 'Degraded', sources: [], links: [] },
    { id: 'claude', name: 'Claude', health: 'outage', detail: 'Outage', sources: [], links: [] },
    { id: 'codex', name: 'Codex', health: 'operational', detail: 'Operational', sources: [], links: [] },
  ],
}

describe('compact status snapshots', () => {
  it('encodes an immutable snapshot in an eleven-character URL-safe token', () => {
    const token = createCompactStatusSnapshot(status, SECRET)

    expect(token).toMatch(/^[A-Za-z0-9_-]{11}$/)
    expect(isCompactSnapshotToken(token)).toBe(true)
    expect(compactSnapshotUrl(token)).toBe(`/s/${token}`)
    expect(parseCompactStatusSnapshot(token, SECRET)).toEqual({
      v: 1,
      answer: 'no',
      checkedAt: '2026-08-18T03:51:00.000Z',
      capturedAt: '2026-08-18T03:51:00.000Z',
      affected: ['cloudflare', 'claude'],
    })
  })

  it('is deterministic for everyone sharing the same checked minute', () => {
    const first = createCompactStatusSnapshot(status, SECRET)
    const second = createCompactStatusSnapshot({
      ...status,
      checkedAt: '2026-08-18T03:51:59.999Z',
    }, SECRET)

    expect(second).toBe(first)
  })

  it('rejects tampering, alternate secrets, and non-canonical tokens', () => {
    const token = createCompactStatusSnapshot(status, SECRET)
    const replacement = token.endsWith('A') ? 'B' : 'A'

    expect(parseCompactStatusSnapshot(`${token.slice(0, -1)}${replacement}`, SECRET)).toBeNull()
    expect(parseCompactStatusSnapshot(token, 'a-different-secret-with-32-characters')).toBeNull()
    expect(parseCompactStatusSnapshot(`${token}x`, SECRET)).toBeNull()
  })
})
