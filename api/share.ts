import { compactSnapshotUrl, createCompactStatusSnapshot } from '../server/snapshot-compact.js'
import type { LiveStatusResponse } from '../src/lib/status.js'

interface RequestLike {
  method?: string
  headers?: Record<string, string | string[] | undefined>
}

interface ResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

const SERVICE_IDS = new Set(['github', 'cloudflare', 'claude', 'codex'])
const HEALTH_STATES = new Set(['operational', 'degraded', 'outage', 'unknown'])

function publicOrigin(): string {
  const previewOrigin = process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined
  const origin = new URL(process.env.PUBLIC_ORIGIN ?? previewOrigin ?? 'https://caniworknow.com')
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') throw new Error('PUBLIC_ORIGIN must use HTTP(S)')
  return origin.origin
}

function statusOrigin(): string {
  const origin = new URL(process.env.STATUS_ORIGIN ?? process.env.PUBLIC_ORIGIN ?? 'https://caniworknow.com')
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') throw new Error('STATUS_ORIGIN must use HTTP(S)')
  return origin.origin
}

function firstHeader(request: RequestLike, name: string): string {
  const value = request.headers?.[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function isLiveStatus(value: unknown): value is LiveStatusResponse {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<LiveStatusResponse>
  const services = status.services
  return (status.answer === 'yes' || status.answer === 'no' || status.answer === 'unknown')
    && typeof status.checkedAt === 'string'
    && Number.isFinite(Date.parse(status.checkedAt))
    && Array.isArray(services)
    && services.length <= SERVICE_IDS.size
    && services.every((service) => service
      && typeof service === 'object'
      && SERVICE_IDS.has(service.id)
      && HEALTH_STATES.has(service.health))
    && new Set(services.map((service) => service.id)).size === services.length
}

async function readCurrentStatus(origin: string): Promise<LiveStatusResponse> {
  const response = await fetch(`${origin}/api/status`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) throw new Error(`Status request failed: ${response.status}`)
  const raw = await response.text()
  if (raw.length > 64_000) throw new Error('Status response is too large')
  const status: unknown = JSON.parse(raw)
  if (!isLiveStatus(status)) throw new Error('Status response is invalid')
  return status
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('Allow', 'POST')
    response.end('Method Not Allowed')
    return
  }

  if (firstHeader(request, 'sec-fetch-site').toLowerCase() === 'cross-site') {
    response.statusCode = 403
    response.setHeader('Cache-Control', 'no-store')
    response.end('Forbidden')
    return
  }

  if (!firstHeader(request, 'content-type').toLowerCase().startsWith('application/json')) {
    response.statusCode = 415
    response.setHeader('Cache-Control', 'no-store')
    response.end('Unsupported Media Type')
    return
  }

  const contentLength = Number(firstHeader(request, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    response.statusCode = 413
    response.setHeader('Cache-Control', 'no-store')
    response.end('Payload Too Large')
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
    const status = await readCurrentStatus(statusOrigin())
    const token = createCompactStatusSnapshot(status, secret)
    const url = `${origin}${compactSnapshotUrl(token)}`

    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ url, answer: status.answer, checkedAt: status.checkedAt }))
  } catch {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(JSON.stringify({ error: 'Live status is temporarily unavailable' }))
  }
}
