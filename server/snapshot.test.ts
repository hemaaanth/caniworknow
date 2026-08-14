import { describe, expect, it } from 'vitest'
import type { LiveStatusResponse } from '../src/lib/status.js'
import {
  createStatusSnapshot,
  parseStatusSnapshot,
  renderSnapshotHtml,
  snapshotUrl,
} from './snapshot.js'
import { renderSnapshotPng } from './snapshot-image.js'

const SECRET = 'test-secret-with-enough-entropy'
const status: LiveStatusResponse = {
  answer: 'no',
  checkedAt: '2026-08-14T00:30:00.000Z',
  services: [
    {
      id: 'claude',
      name: 'Claude',
      health: 'outage',
      detail: 'Claude API has an outage',
      sources: [],
      links: [],
    },
    {
      id: 'github',
      name: 'GitHub',
      health: 'operational',
      detail: 'No current problems detected',
      sources: [],
      links: [],
    },
  ],
}

describe('status snapshots', () => {
  it('creates a compact signed immutable snapshot', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)

    expect(snapshot).toEqual({
      v: 1,
      answer: 'no',
      checkedAt: '2026-08-14T00:30:00.000Z',
      capturedAt: '2026-08-14T00:31:00.000Z',
      affected: ['claude'],
    })
    expect(token.length).toBeLessThan(240)
    expect(parseStatusSnapshot(`${token.slice(0, -1)}x`, SECRET)).toBeNull()
    expect(parseStatusSnapshot(token, 'a-different-secret')).toBeNull()
  })

  it('renders immutable social metadata and a live-status comparison page', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    expect(snapshot).not.toBeNull()

    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain('<meta property="og:title" content="NO — Can I Work Now?"')
    expect(html).toContain('Claude had a current issue')
    expect(html).toContain('Checked Aug 14, 2026 · 00:30 UTC')
    expect(html).toContain(`https://caniworknow.com${snapshotUrl(token)}`)
    expect(html).toContain('/api/og?token=')
    expect(html).toContain('This shared snapshot')
    expect(html).toContain('View live status')
    expect(html).toContain("fetch('/api/status'")
  })

  it('renders a timestamped 1200×630 PNG social card', async () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const png = await renderSnapshotPng(snapshot!)

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(png.byteLength).toBeLessThan(500_000)
  })
})
