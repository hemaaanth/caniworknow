import { parseStatusSnapshot } from '../server/snapshot-v1.js'
import { renderSnapshotPng } from '../server/snapshot-image-v1.js'

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

  const snapshot = parseStatusSnapshot(first(request.query?.token), process.env.SNAPSHOT_SECRET ?? '')
  if (!snapshot) {
    response.statusCode = 404
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end('Status snapshot not found')
    return
  }

  const png = await renderSnapshotPng(snapshot)
  response.statusCode = 200
  response.setHeader('Content-Type', 'image/png')
  response.setHeader('Content-Length', png.length)
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(png)
}
