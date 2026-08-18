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

  const secret = process.env.SNAPSHOT_SECRET ?? ''
  const token = first(request.query?.token)
  const snapshot = parseStatusSnapshot(token, secret)
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
  response.setHeader('Content-Security-Policy', "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
  response.end(renderSnapshotHtml(snapshot, token, publicOrigin()))
}
