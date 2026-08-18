import { beforeEach, describe, expect, it, vi } from 'vitest'

const collectLiveStatus = vi.hoisted(() => vi.fn())
vi.mock('../server/collect.js', () => ({ collectLiveStatus }))

import statusHandler from '../api/status.js'

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

beforeEach(() => {
  collectLiveStatus.mockReset()
  collectLiveStatus.mockResolvedValue({ answer: 'yes', checkedAt: '2026-08-18T02:00:00.000Z', services: [] })
})

describe('status API handler', () => {
  it('shares one five-minute CDN result across visitors', async () => {
    const response = new MockResponse()
    await statusHandler({ method: 'GET' }, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=900')
    expect(response.headers.get('cdn-cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=900')
    expect(collectLiveStatus).toHaveBeenCalledOnce()
  })

  it('rejects cache-busting query parameters before collecting upstream status', async () => {
    const response = new MockResponse()
    await statusHandler({ method: 'GET', query: { cacheBust: 'unique' } }, response)

    expect(response.statusCode).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(collectLiveStatus).not.toHaveBeenCalled()
  })

  it('allows only GET requests', async () => {
    const response = new MockResponse()
    await statusHandler({ method: 'POST' }, response)

    expect(response.statusCode).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(collectLiveStatus).not.toHaveBeenCalled()
  })
})
