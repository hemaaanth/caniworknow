import { randomInt } from 'node:crypto'
import { get, put } from '@vercel/blob'

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const ID_LENGTH = 8
const SNAPSHOT_PREFIX = 'snapshots/'
const SNAPSHOT_V4_PREFIX = 'snapshots-v4/'
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

async function storeSnapshotTokenAtPrefix(
  prefix: string,
  token: string,
  createId: () => string,
  reservedPrefixes: string[] = [],
): Promise<string> {
  let lastCollision: Error | null = null

  for (let attempt = 0; attempt < MAX_STORE_ATTEMPTS; attempt += 1) {
    const id = createId()
    const occupied = await Promise.all(reservedPrefixes.map(async (reservedPrefix) => {
      const result = await get(`${reservedPrefix}${id}`, { access: 'private' })
      return result?.statusCode === 200
    }))
    if (occupied.some(Boolean)) {
      lastCollision = new Error('Snapshot id already exists in an immutable namespace')
      continue
    }
    try {
      await put(`${prefix}${id}`, token, {
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

export function storeSnapshotToken(
  token: string,
  createId: () => string = createSnapshotId,
): Promise<string> {
  return storeSnapshotTokenAtPrefix(SNAPSHOT_PREFIX, token, createId)
}

export function storeSnapshotTokenV4(
  token: string,
  createId: () => string = createSnapshotId,
): Promise<string> {
  return storeSnapshotTokenAtPrefix(SNAPSHOT_V4_PREFIX, token, createId, [SNAPSHOT_PREFIX])
}

async function loadSnapshotTokenAtPrefix(prefix: string, id: string): Promise<string | null> {
  if (!isSnapshotId(id)) return null
  const result = await get(`${prefix}${id}`, { access: 'private' })
  if (!result || result.statusCode !== 200) return null
  const token = await new Response(result.stream).text()
  return token.length <= 512 ? token : null
}

export function loadSnapshotToken(id: string): Promise<string | null> {
  return loadSnapshotTokenAtPrefix(SNAPSHOT_PREFIX, id)
}

export function loadSnapshotTokenV4(id: string): Promise<string | null> {
  return loadSnapshotTokenAtPrefix(SNAPSHOT_V4_PREFIX, id)
}
