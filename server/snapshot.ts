import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Answer, LiveStatusResponse, ServiceId } from '../src/lib/status.js'

const SNAPSHOT_VERSION = 1 as const
const SERVICE_NAMES: Record<ServiceId, string> = {
  github: 'GitHub',
  cloudflare: 'Cloudflare',
  claude: 'Claude',
  codex: 'Codex',
}
const SERVICE_IDS = Object.keys(SERVICE_NAMES) as ServiceId[]

export interface StatusSnapshot {
  v: typeof SNAPSHOT_VERSION
  answer: Answer
  checkedAt: string
  capturedAt: string
  affected: ServiceId[]
}

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
  return `/s/${encodeURIComponent(token)}`
}

export function formatSnapshotChecked(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `Checked ${value('month')} ${value('day')}, ${value('year')} · ${value('hour')}:${value('minute')} UTC`
}

export function snapshotIssueLabel(snapshot: StatusSnapshot): string {
  const names = snapshot.affected.map((id) => SERVICE_NAMES[id])
  if (snapshot.answer === 'yes') return 'All monitored systems were operational'
  if (snapshot.answer === 'unknown') return 'Status could not be confirmed'
  if (names.length === 0) return 'A monitored system had a current issue'
  if (names.length === 1) return `${names[0]} had a current issue`
  if (names.length === 2) return `${names[0]} and ${names[1]} had current issues`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} had current issues`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function snapshotAnswerWord(answer: Answer): string {
  return answer === 'yes' ? 'YES' : answer === 'no' ? 'NO' : 'UNKNOWN'
}

export function renderSnapshotHtml(snapshot: StatusSnapshot, token: string, origin: string): string {
  const answer = snapshotAnswerWord(snapshot.answer)
  const description = snapshotIssueLabel(snapshot)
  const checked = formatSnapshotChecked(snapshot.checkedAt)
  const canonical = `${origin}${snapshotUrl(token)}`
  const image = `${origin}/api/og?token=${encodeURIComponent(token)}`
  const state = JSON.stringify(snapshot).replaceAll('<', '\\u003c')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
  <style>
    :root{font-family:ui-sans-serif,system-ui,sans-serif;color:#13251e;background:#dcebdc;color-scheme:light dark}
    *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 28% 20%,#f4efe2 0,#a8d3bf 38%,#347d68 100%)}
    main{width:min(680px,100%);padding:clamp(28px,6vw,64px);background:rgba(244,239,226,.9);box-shadow:0 20px 80px rgba(7,25,21,.18);backdrop-filter:blur(18px)}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.verdict{margin:.42em 0 0;font-size:clamp(7rem,30vw,15rem);font-weight:850;line-height:.72;letter-spacing:-.09em}.detail{margin:36px 0 0;font-size:clamp(1.1rem,3vw,1.45rem);font-weight:650}.checked{margin:8px 0 0;opacity:.64}.comparison{margin-top:34px;padding-top:22px;border-top:1px solid rgba(19,37,30,.2);line-height:1.45}.comparison strong{display:block;margin-bottom:5px}.action{display:inline-block;margin-top:20px;color:inherit;font-size:12px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;text-underline-offset:4px}
    @media(prefers-color-scheme:dark){:root{color:#edf5eb;background:#071915}body{background:radial-gradient(circle at 28% 20%,#395c48 0,#17453a 42%,#050806 100%)}main{background:rgba(5,8,6,.86)}.comparison{border-color:rgba(237,245,235,.2)}}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Can I Work Now · Status snapshot</div>
    <h1 class="verdict">${answer}</h1>
    <p class="detail">${escapeHtml(description)}</p>
    <p class="checked">${escapeHtml(checked)}</p>
    <section class="comparison" id="comparison" aria-live="polite">
      <strong>This shared snapshot is being compared with the live status.</strong>
      <span>Checking for a newer verdict…</span>
    </section>
    <a class="action" href="/">View live status →</a>
  </main>
  <script>const snapshot=${state};fetch('/api/status',{headers:{accept:'application/json'}}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(current=>{const currentAffected=current.services.filter(service=>service.health==='outage'||service.health==='degraded').map(service=>service.id).join(',');const snapshotAffected=snapshot.affected.join(',');const changed=current.answer!==snapshot.answer||currentAffected!==snapshotAffected;const newer=Date.parse(current.checkedAt)>Date.parse(snapshot.checkedAt);const comparison=document.querySelector('#comparison');if(changed){comparison.innerHTML='<strong>Status has changed.</strong><span>This snapshot said '+snapshot.answer.toUpperCase()+' when checked. The current verdict is '+current.answer.toUpperCase()+'.</span>'}else if(newer){comparison.innerHTML='<strong>A newer check is available.</strong><span>The current verdict is still '+current.answer.toUpperCase()+'.</span>'}else{comparison.innerHTML='<strong>Still current.</strong><span>The live verdict still matches this snapshot.</span>'}}).catch(()=>{document.querySelector('#comparison').innerHTML='<strong>Live comparison unavailable.</strong><span>The timestamp above shows when this snapshot was checked.</span>'})</script>
</body>
</html>`
}
