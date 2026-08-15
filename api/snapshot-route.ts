import legacyHandler from './snapshot-v1.js'
import currentHandler from './snapshot-v4.js'
import { isSnapshotId } from '../server/snapshot-store.js'

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

export default async function handler(request: RequestLike, response: ResponseLike): Promise<void> {
  if (isSnapshotId(first(request.query?.token))) {
    await currentHandler(request, response)
    return
  }
  legacyHandler(request, response)
}
