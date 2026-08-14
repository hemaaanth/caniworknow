import { storeSnapshotToken } from '../server/snapshot-store.js'
import { createStatusSnapshot } from '../server/snapshot-v3.js'
import type { LiveStatusResponse } from '../src/lib/status.js'

interface RequestLike {
  method?: string
}

interface ResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

function publicOrigin(): string {
  return (process.env.PUBLIC_ORIGIN ?? 'https://caniworknow.com').replace(/\/$/, '')
}

function isLiveStatus(value: unknown): value is LiveStatusResponse {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<LiveStatusResponse>
  return (status.answer === 'yes' || status.answer === 'no' || status.answer === 'unknown')
    && typeof status.checkedAt === 'string'
    && Number.isFinite(Date.parse(status.checkedAt))
    && Array.isArray(status.services)
}

async function readCurrentStatus(origin: string): Promise<LiveStatusResponse> {
  const response = await fetch(`${origin}/api/status`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) throw new Error(`Status request failed: ${response.status}`)
  const status: unknown = await response.json()
  if (!isLiveStatus(status)) throw new Error('Status response is invalid')
  return status
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end('Method Not Allowed')
    return
  }

  const secret = process.env.SNAPSHOT_SECRET
  if (!secret || secret.length < 32) {
    response.statusCode = 503
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ error: 'Status sharing is not configured' }))
    return
  }

  try {
    const origin = publicOrigin()
    const status = await readCurrentStatus(origin)
    const token = createStatusSnapshot(status, secret)
    const id = await storeSnapshotToken(token)
    const url = `${origin}/s/${id}`

    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20')
    response.end(JSON.stringify({ url, answer: status.answer, checkedAt: status.checkedAt }))
  } catch {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ error: 'Live status is temporarily unavailable' }))
  }
}
