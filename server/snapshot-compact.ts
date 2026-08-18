import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Answer, LiveStatusResponse } from '../src/lib/status.js'
import { SERVICE_IDS, type StatusSnapshot } from '../src/lib/snapshot-presentation.js'

const EPOCH_MS = Date.UTC(2024, 0, 1)
const MAX_MINUTE = 0xff_ffff
const PAYLOAD_BYTES = 4
const SIGNATURE_BYTES = 4
const TOKEN_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES
const TOKEN_LENGTH = 11
const VERSION_BITS = 0b01_00_0000
const VERSION_MASK = 0b11_00_0000

const ANSWER_CODES: Record<Answer, number> = {
  yes: 0,
  no: 1,
  unknown: 2,
}
const CODE_ANSWERS: Answer[] = ['yes', 'no', 'unknown']

function signature(payload: Buffer, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest().subarray(0, SIGNATURE_BYTES)
}

export function isCompactSnapshotToken(value: string): boolean {
  return value.length === TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value)
}

export function createCompactStatusSnapshot(status: LiveStatusResponse, secret: string): string {
  if (!secret) throw new Error('SNAPSHOT_SECRET is required')

  const checkedAt = Date.parse(status.checkedAt)
  const minute = Math.floor((checkedAt - EPOCH_MS) / 60_000)
  if (!Number.isFinite(checkedAt) || minute < 0 || minute > MAX_MINUTE) {
    throw new Error('Snapshot checkedAt is outside the compact token range')
  }

  const affectedMask = status.services.reduce((mask, service) => {
    if (service.health !== 'outage' && service.health !== 'degraded') return mask
    const index = SERVICE_IDS.indexOf(service.id)
    return index < 0 ? mask : mask | (1 << index)
  }, 0)
  const payload = Buffer.alloc(PAYLOAD_BYTES)
  payload.writeUIntBE(minute, 0, 3)
  payload[3] = VERSION_BITS | (ANSWER_CODES[status.answer] << 4) | affectedMask

  return Buffer.concat([payload, signature(payload, secret)]).toString('base64url')
}

export function parseCompactStatusSnapshot(token: string, secret: string): StatusSnapshot | null {
  if (!secret || !isCompactSnapshotToken(token)) return null

  try {
    const bytes = Buffer.from(token, 'base64url')
    if (bytes.length !== TOKEN_BYTES || bytes.toString('base64url') !== token) return null
    const payload = bytes.subarray(0, PAYLOAD_BYTES)
    const supplied = bytes.subarray(PAYLOAD_BYTES)
    const expected = signature(payload, secret)
    if (!timingSafeEqual(supplied, expected)) return null

    const state = payload[3]
    if ((state & VERSION_MASK) !== VERSION_BITS) return null
    const answer = CODE_ANSWERS[(state >> 4) & 0b11]
    if (!answer) return null

    const checkedAt = new Date(EPOCH_MS + payload.readUIntBE(0, 3) * 60_000).toISOString()
    const affectedMask = state & 0b1111
    const affected = SERVICE_IDS.filter((_, index) => (affectedMask & (1 << index)) !== 0)
    return { v: 1, answer, checkedAt, capturedAt: checkedAt, affected }
  } catch {
    return null
  }
}

export function compactSnapshotUrl(token: string): string {
  return `/s/${token}`
}
