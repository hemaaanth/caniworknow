import legacyHandler from './snapshot-v1.js'
import currentHandler from './snapshot-v4.js'
import { isCompactSnapshotToken, parseCompactStatusSnapshot } from '../server/snapshot-compact.js'
import { isSnapshotId } from '../server/snapshot-store.js'
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
  const previewOrigin = process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined
  return new URL(process.env.PUBLIC_ORIGIN ?? previewOrigin ?? 'https://caniworknow.com').origin
}

function serveCompactSnapshot(token: string, response: ResponseLike): void {
  const secret = process.env.SNAPSHOT_SECRET
  if (!secret || secret.length < 32) {
    response.statusCode = 503
    response.end('Status sharing is not configured')
    return
  }

  const snapshot = parseCompactStatusSnapshot(token, secret)
  if (!snapshot) {
    response.statusCode = 404
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
    imagePath: `/api/og-v4?token=${encodeURIComponent(token)}`,
  }))
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  const token = first(request.query?.token)
  if (isSnapshotId(token)) {
    await currentHandler(request, response)
    return
  }
  if (isCompactSnapshotToken(token)) {
    serveCompactSnapshot(token, response)
    return
  }
  legacyHandler(request, response)
}
