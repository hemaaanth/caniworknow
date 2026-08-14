import { loadSnapshotToken } from '../server/snapshot-store.js'
import { renderSnapshotPng } from '../server/snapshot-image-v3.js'
import { parseStatusSnapshot } from '../server/snapshot-v3.js'

interface RequestLike {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

interface ResponseLike {
  statusCode: number
  setHeader(name: string, value: string | number): void
  end(body?: string | Buffer): void
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
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

  try {
    const token = await loadSnapshotToken(first(request.query?.id))
    const snapshot = token ? parseStatusSnapshot(token, secret) : null
    if (!snapshot) {
      response.statusCode = 404
      response.setHeader('Cache-Control', 'no-store')
      response.end('Snapshot not found')
      return
    }

    const png = await renderSnapshotPng(snapshot)
    response.statusCode = 200
    response.setHeader('Content-Type', 'image/png')
    response.setHeader('Content-Length', png.byteLength)
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(png)
  } catch {
    response.statusCode = 502
    response.setHeader('Cache-Control', 'no-store')
    response.end('Snapshot storage is temporarily unavailable')
  }
}
