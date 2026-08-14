import { randomInt } from 'node:crypto'
import { get, put } from '@vercel/blob'

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const ID_LENGTH = 8
const SNAPSHOT_PREFIX = 'snapshots/'
const MAX_STORE_ATTEMPTS = 4

function isBlobPathCollision(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('This blob already exists')
}

export function createSnapshotId(): string {
  let id = ''
  for (let index = 0; index < ID_LENGTH; index += 1) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)]
  return id
}

export function isSnapshotId(value: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(value)
}

export async function storeSnapshotToken(
  token: string,
  createId: () => string = createSnapshotId,
): Promise<string> {
  let lastCollision: Error | null = null

  for (let attempt = 0; attempt < MAX_STORE_ATTEMPTS; attempt += 1) {
    const id = createId()
    try {
      await put(`${SNAPSHOT_PREFIX}${id}`, token, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'text/plain; charset=utf-8',
        cacheControlMaxAge: 31_536_000,
      })
      return id
    } catch (error) {
      if (!isBlobPathCollision(error)) throw error
      lastCollision = error
    }
  }

  throw lastCollision ?? new Error('Unable to allocate a snapshot id')
}

export async function loadSnapshotToken(id: string): Promise<string | null> {
  if (!isSnapshotId(id)) return null
  const result = await get(`${SNAPSHOT_PREFIX}${id}`, { access: 'private' })
  if (!result || result.statusCode !== 200) return null
  const token = await new Response(result.stream).text()
  return token.length <= 512 ? token : null
}
