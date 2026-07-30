import { collectLiveStatus } from '../server/collect.js'

interface RequestLike {
  method?: string
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

  const status = await collectLiveStatus()
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  response.setHeader('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  response.end(JSON.stringify(status))
}
