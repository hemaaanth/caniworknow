import { createHmac, timingSafeEqual } from 'node:crypto'
import type { LiveStatusResponse } from '../src/lib/status.js'
import {
  formatSnapshotChecked,
  SERVICE_IDS,
  snapshotAnswerWord,
  snapshotIssueLabel,
  type StatusSnapshot,
} from '../src/lib/snapshot-presentation.js'

export {
  formatSnapshotChecked,
  snapshotAnswerWord,
  snapshotIssueLabel,
  type StatusSnapshot,
} from '../src/lib/snapshot-presentation.js'

const SNAPSHOT_VERSION = 1 as const

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isSnapshot(value: unknown): value is StatusSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<StatusSnapshot>
  return snapshot.v === SNAPSHOT_VERSION
    && (snapshot.answer === 'yes' || snapshot.answer === 'no' || snapshot.answer === 'unknown')
    && validDate(snapshot.checkedAt)
    && validDate(snapshot.capturedAt)
    && Array.isArray(snapshot.affected)
    && snapshot.affected.length <= SERVICE_IDS.length
    && snapshot.affected.every((id) => SERVICE_IDS.includes(id))
}

export function createStatusSnapshot(
  status: LiveStatusResponse,
  secret: string,
  capturedAt = new Date().toISOString(),
): string {
  if (!secret) throw new Error('SNAPSHOT_SECRET is required')
  const snapshot: StatusSnapshot = {
    v: SNAPSHOT_VERSION,
    answer: status.answer,
    checkedAt: status.checkedAt,
    capturedAt,
    affected: status.services
      .filter((service) => service.health === 'outage' || service.health === 'degraded')
      .map((service) => service.id),
  }
  const payload = Buffer.from(JSON.stringify(snapshot)).toString('base64url')
  return `${payload}.${signature(payload, secret)}`
}

export function parseStatusSnapshot(token: string, secret: string): StatusSnapshot | null {
  if (!secret || token.length > 512) return null
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = token.slice(0, separator)
  const supplied = token.slice(separator + 1)
  const expected = signature(payload, secret)
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return isSnapshot(decoded) ? decoded : null
  } catch {
    return null
  }
}

export function snapshotUrl(token: string): string {
  return `/s/v2/${encodeURIComponent(token)}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export interface SnapshotPresentation {
  snapshotPath: string
  imagePath: string
}

export function renderSnapshotHtml(
  snapshot: StatusSnapshot,
  token: string,
  origin: string,
  presentation?: SnapshotPresentation,
): string {
  const answer = snapshotAnswerWord(snapshot.answer)
  const description = snapshotIssueLabel(snapshot)
  const checked = formatSnapshotChecked(snapshot.checkedAt)
  const canonical = `${origin}${presentation?.snapshotPath ?? snapshotUrl(token)}`
  const image = `${origin}${presentation?.imagePath ?? `/api/og-v2?token=${encodeURIComponent(token)}`}`
  const state = JSON.stringify(snapshot).replaceAll('<', '\\u003c')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preload" href="/fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/assets/style.css" />
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4efe2" />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#080907" />
  <meta name="description" content="${escapeHtml(`${description}. ${checked}.`)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:site_name" content="Can I Work Now?" />
  <meta property="og:title" content="${answer} — Can I Work Now?" />
  <meta property="og:description" content="${escapeHtml(`${description}. ${checked}.`)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(`${answer}. ${description}. ${checked}.`)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${answer} — Can I Work Now?" />
  <meta name="twitter:description" content="${escapeHtml(`${description}. ${checked}.`)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <title>${answer} — Status snapshot</title>
</head>
<body>
  <div id="root"></div>
  <script>globalThis.__CANIWORKNOW_SNAPSHOT__=${state}</script>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>`
}
