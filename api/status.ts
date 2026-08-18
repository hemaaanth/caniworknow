import { collectLiveStatus } from '../server/collect.js'

interface RequestLike {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

interface ResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end('Method Not Allowed')
    return
  }

  if (request.query && Object.keys(request.query).length > 0) {
    response.statusCode = 400
    response.setHeader('Cache-Control', 'no-store')
    response.end('Query parameters are not supported')
    return
  }

  const status = await collectLiveStatus()
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900')
  response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900')
  response.end(JSON.stringify(status))
}
