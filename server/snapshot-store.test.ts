import { beforeEach, describe, expect, it, vi } from 'vitest'

const blobMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@vercel/blob', () => blobMocks)

import { storeSnapshotToken, storeSnapshotTokenV4 } from './snapshot-store.js'

type StoreWithIdFactory = (token: string, createId: () => string) => Promise<string>
const storeWithIdFactory = storeSnapshotToken as StoreWithIdFactory
const storeV4WithIdFactory = storeSnapshotTokenV4 as StoreWithIdFactory
const collision = new Error('Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.')

describe('snapshot storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores new cards in the isolated v4 namespace', async () => {
    blobMocks.put.mockResolvedValue({ url: 'private-blob-url' })

    const id = await storeV4WithIdFactory('signed-token', () => 'A1b2C3d4')

    expect(id).toBe('A1b2C3d4')
    expect(blobMocks.put).toHaveBeenCalledWith('snapshots-v4/A1b2C3d4', 'signed-token', expect.objectContaining({ access: 'private' }))
  })

  it('avoids ids already occupied by immutable v3 snapshots', async () => {
    blobMocks.get.mockResolvedValueOnce({ statusCode: 200 }).mockResolvedValueOnce(null)
    blobMocks.put.mockResolvedValue({ url: 'private-blob-url' })
    const ids = ['A1b2C3d4', 'E5f6G7h8'][Symbol.iterator]()

    const id = await storeV4WithIdFactory('signed-token', () => ids.next().value!)

    expect(id).toBe('E5f6G7h8')
    expect(blobMocks.put).toHaveBeenCalledOnce()
    expect(blobMocks.put.mock.calls[0][0]).toBe('snapshots-v4/E5f6G7h8')
  })

  it('retries with a fresh id when a blob pathname already exists', async () => {
    blobMocks.put.mockRejectedValueOnce(collision).mockResolvedValueOnce({ url: 'private-blob-url' })
    const ids = ['A1b2C3d4', 'E5f6G7h8'][Symbol.iterator]()

    const id = await storeWithIdFactory('signed-token', () => ids.next().value!)

    expect(id).toBe('E5f6G7h8')
    expect(blobMocks.put).toHaveBeenCalledTimes(2)
    expect(blobMocks.put.mock.calls.map(([pathname]) => pathname)).toEqual([
      'snapshots/A1b2C3d4',
      'snapshots/E5f6G7h8',
    ])
  })

  it('stops after four pathname collisions', async () => {
    blobMocks.put.mockRejectedValue(collision)

    await expect(storeWithIdFactory('signed-token', () => 'A1b2C3d4')).rejects.toBe(collision)

    expect(blobMocks.put).toHaveBeenCalledTimes(4)
  })

  it('does not retry unrelated storage failures', async () => {
    const outage = new Error('Vercel Blob: service unavailable')
    blobMocks.put.mockRejectedValue(outage)

    await expect(storeWithIdFactory('signed-token', () => 'A1b2C3d4')).rejects.toBe(outage)

    expect(blobMocks.put).toHaveBeenCalledTimes(1)
  })
})
