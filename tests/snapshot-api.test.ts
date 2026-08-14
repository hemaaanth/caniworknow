import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ogV2Handler from '../api/og-v2.js'
import shareHandler from '../api/share.js'
import snapshotHandler from '../api/snapshot.js'
import { createStatusSnapshot } from '../server/snapshot.js'
import type { LiveStatusResponse } from '../src/lib/status.js'

const SECRET = 'a-stable-test-secret-with-32-characters'
const status: LiveStatusResponse = {
  answer: 'yes',
  checkedAt: '2026-08-14T01:40:00.000Z',
  services: [
    { id: 'github', name: 'GitHub', health: 'operational', detail: 'Operational', sources: [], links: [{ label: 'Official', url: 'https://example.test' }] },
    { id: 'cloudflare', name: 'Cloudflare', health: 'operational', detail: 'Operational', sources: [], links: [{ label: 'Official', url: 'https://example.test' }] },
    { id: 'claude', name: 'Claude', health: 'operational', detail: 'Operational', sources: [], links: [{ label: 'Official', url: 'https://example.test' }] },
    { id: 'codex', name: 'Codex', health: 'operational', detail: 'Operational', sources: [], links: [{ label: 'Official', url: 'https://example.test' }] },
  ],
}

const apiOgSource = readFileSync(fileURLToPath(new URL('../api/og.ts', import.meta.url)), 'utf8')
const apiOgV2Source = readFileSync(fileURLToPath(new URL('../api/og-v2.ts', import.meta.url)), 'utf8')
const apiSnapshotV1Source = readFileSync(fileURLToPath(new URL('../api/snapshot-v1.ts', import.meta.url)), 'utf8')
const vercelConfig = readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')

class MockResponse {
  statusCode = 200
  headers = new Map<string, string>()
  body = ''

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value)
  }

  end(body = '') {
    this.body = body
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SNAPSHOT_SECRET
  delete process.env.PUBLIC_ORIGIN
})

describe('snapshot API handlers', () => {
  it('pins each immutable presentation route to its renderer version', () => {
    expect(apiOgSource).toContain("../server/snapshot-image-v1.js")
    expect(apiOgV2Source).toContain("../server/snapshot-image.js")
    expect(apiOgV2Source).not.toContain("export { default } from './og.js'")
    expect(apiSnapshotV1Source).toContain("../server/snapshot-v1.js")

    const rewrites = JSON.parse(vercelConfig).rewrites
    expect(rewrites).toContainEqual({ source: '/s/v2/:token', destination: '/api/snapshot?token=:token' })
    expect(rewrites).toContainEqual({ source: '/s/:token', destination: '/api/snapshot-v1?token=:token' })
  })

  it('creates a signed URL from the CDN-backed current status', async () => {
    process.env.SNAPSHOT_SECRET = SECRET
    process.env.PUBLIC_ORIGIN = 'https://caniworknow.com'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const response = new MockResponse()

    await shareHandler({ method: 'GET' }, response)

    expect(response.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('https://caniworknow.com/api/status', expect.any(Object))
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('cdn-cache-control')).toContain('s-maxage=10')
    const body = JSON.parse(response.body) as { url: string; answer: string }
    expect(body.answer).toBe('yes')
    expect(body.url).toMatch(/^https:\/\/caniworknow\.com\/s\/v2\/[A-Za-z0-9_.-]+$/)
  })

  it('fails closed when the signing secret is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = new MockResponse()

    await shareHandler({ method: 'GET' }, response)

    expect(response.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves immutable crawler metadata with fixed-origin security headers', async () => {
    process.env.SNAPSHOT_SECRET = SECRET
    process.env.PUBLIC_ORIGIN = 'https://caniworknow.com'
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T01:41:00.000Z')
    const response = new MockResponse()

    await snapshotHandler({ method: 'GET', query: { token } }, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('content-security-policy')).toContain("font-src 'self'")
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.body).toContain(`rel="canonical" href="https://caniworknow.com/s/v2/${token}"`)
    expect(response.body).not.toContain('evil.example')
  })

  it('serves the versioned OG card as an immutable PNG', async () => {
    process.env.SNAPSHOT_SECRET = SECRET
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T01:41:00.000Z')
    const headers = new Map<string, string | number>()
    let statusCode = 200
    let body: string | Buffer | undefined
    const response = {
      get statusCode() { return statusCode },
      set statusCode(value: number) { statusCode = value },
      setHeader(name: string, value: string | number) { headers.set(name.toLowerCase(), value) },
      end(value?: string | Buffer) { body = value },
    }

    await ogV2Handler({ method: 'GET', query: { token } }, response)

    expect(statusCode).toBe(200)
    expect(headers.get('content-type')).toBe('image/png')
    expect(headers.get('cache-control')).toContain('immutable')
    expect(Buffer.isBuffer(body)).toBe(true)
    expect((body as Buffer).readUInt32BE(16)).toBe(1200)
    expect((body as Buffer).readUInt32BE(20)).toBe(630)
  })

  it('rejects malformed and oversized snapshot identifiers', async () => {
    process.env.SNAPSHOT_SECRET = SECRET
    for (const token of ['not-a-snapshot', `a.${'b'.repeat(600)}`]) {
      const response = new MockResponse()
      await snapshotHandler({ method: 'GET', query: { token } }, response)
      expect(response.statusCode).toBe(404)
    }
  })
})
