import { parseCompactStatusSnapshot } from '../server/snapshot-compact.js'
import { renderSnapshotHtml } from '../server/snapshot-v3.js'

interface RequestLike {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

interface ResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function publicOrigin(): string {
  return (process.env.PUBLIC_ORIGIN ?? 'https://caniworknow.com').replace(/\/$/, '')
}

export default function handler(request: RequestLike, response: ResponseLike): void {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end('Method Not Allowed')
    return
  }

  const token = first(request.query?.token)
  const snapshot = parseCompactStatusSnapshot(token, process.env.SNAPSHOT_SECRET ?? '')
  if (!snapshot) {
    response.statusCode = 404
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end('Status snapshot not found')
    return
  }

  response.statusCode = 200
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Content-Security-Policy', "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
  response.end(renderSnapshotHtml(snapshot, token, publicOrigin(), {
    snapshotPath: `/s/${token}`,
    imagePath: `/api/og-v5?token=${encodeURIComponent(token)}`,
  }))
}
