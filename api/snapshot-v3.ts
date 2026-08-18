import { loadSnapshotToken } from '../server/snapshot-store.js'
import { parseStatusSnapshot, renderSnapshotHtml } from '../server/snapshot-v3.js'

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
    response.end('Status sharing is not configured')
    return
  }

  const id = first(request.query?.token)
  try {
    const token = await loadSnapshotToken(id)
    const snapshot = token ? parseStatusSnapshot(token, secret) : null
    if (!snapshot) {
      response.statusCode = 404
      response.setHeader('Cache-Control', 'no-store')
      response.end('Snapshot not found')
      return
    }

    response.statusCode = 200
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
    response.end(renderSnapshotHtml(snapshot, id, publicOrigin(), {
      snapshotPath: `/s/${id}`,
      imagePath: `/api/og-v3?id=${id}`,
    }))
  } catch {
    response.statusCode = 502
    response.setHeader('Cache-Control', 'no-store')
    response.end('Snapshot storage is temporarily unavailable')
  }
}
