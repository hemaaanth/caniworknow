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
  const affected = snapshot.affected.map((id) => SERVICE_NAMES[id]).join(' · ')
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
    @font-face{font-family:'Instrument Sans Variable';font-style:normal;font-display:swap;font-weight:400 700;src:url('/fonts/instrument-sans-latin-wght-normal.woff2') format('woff2-variations')}
    :root{font-family:'Instrument Sans Variable','Helvetica Neue',Helvetica,Arial,sans-serif;color:#11100e;background:#f4efe2;color-scheme:light dark;--ink:#11100e;--hairline:rgba(17,16,14,.24);--tone-a:#f4efe2;--tone-b:#83c3aa;--tone-c:#f0bea0;--tone-d:#bfddcf;--label-bg:rgba(244,239,226,.84);--label-ink:#11100e}
    *{box-sizing:border-box}html,body{min-width:320px;min-height:100%;margin:0}body{height:100svh;overflow:hidden;background:var(--tone-a);font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}.snapshot{position:relative;isolation:isolate;width:100%;height:100svh;overflow:hidden;color:var(--ink);background:var(--tone-a)}
    .snapshot--no{--tone-a:#f2e5da;--tone-b:#eb7358;--tone-c:#a31728;--tone-d:#d9a342}.snapshot--unknown{--tone-a:#eee9de;--tone-b:#b9b49d;--tone-c:#d6cfad;--tone-d:#8f8b76}
    .shader,.shader::before,.veil{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.shader{z-index:-3;inset:-10%;width:120%;height:120%;background:radial-gradient(ellipse at 12% 18%,var(--tone-a) 0 17%,transparent 47%),radial-gradient(ellipse at 72% 8%,var(--tone-b) 0,transparent 42%),radial-gradient(ellipse at 92% 38%,var(--tone-c) 0,transparent 43%),radial-gradient(ellipse at 34% 88%,var(--tone-b) 0,transparent 48%),var(--tone-d);background-size:112% 112%;filter:saturate(.84) contrast(1.06);animation:shader-drift 18s ease-in-out infinite alternate}.shader::before{content:'';inset:-8%;width:116%;height:116%;background:radial-gradient(circle at 70% 28%,var(--tone-a) 0,transparent 34%),radial-gradient(circle at 25% 68%,var(--tone-c) 0,transparent 38%);filter:blur(42px);opacity:.34;animation:shader-breathe 13s ease-in-out infinite alternate}.snapshot--no .shader{filter:saturate(.92) contrast(1.14)}.veil{z-index:-2;background:linear-gradient(110deg,rgba(255,255,255,.26),transparent 44%),radial-gradient(circle at 50% 45%,transparent 26%,rgba(18,14,9,.09) 120%);mix-blend-mode:soft-light}.snapshot::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;box-shadow:inset 0 0 0 1px var(--hairline)}
    @keyframes shader-drift{0%{transform:translate3d(-2%,-1%,0) scale(1.02);background-position:0 0}55%{transform:translate3d(2%,1.5%,0) scale(1.06);background-position:5% 3%}100%{transform:translate3d(-1%,2%,0) scale(1.035);background-position:-3% 6%}}@keyframes shader-breathe{from{transform:translate3d(-2%,1%,0) scale(.98) rotate(-2deg)}to{transform:translate3d(3%,-2%,0) scale(1.07) rotate(2deg)}}
    .masthead{position:absolute;z-index:4;top:clamp(18px,2.4vw,36px);left:clamp(18px,2.4vw,40px);right:clamp(18px,2.4vw,40px);text-align:center}.wordmark,.snapshot-label,.checked,.comparison,.action,.affected{font-size:11px;font-weight:640;letter-spacing:.075em;text-transform:uppercase}.snapshot-label,.checked,.comparison,.action,.affected{color:var(--label-ink);background:var(--label-bg);box-shadow:0 0 0 3px var(--label-bg);border-radius:1px;backdrop-filter:blur(7px)}.snapshot-label{position:absolute;z-index:5;top:clamp(18px,2.4vw,36px);right:clamp(18px,2.4vw,40px)}
    .answer{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;padding:82px 20px 96px;text-align:center;pointer-events:none}.verdict{margin:0;color:var(--ink);font-size:clamp(10rem,35vw,42rem);font-weight:850;line-height:.7;letter-spacing:-.105em;text-indent:-.105em;text-shadow:0 1px 0 rgba(255,255,255,.11);transform:scaleX(1.035);transform-origin:center}.snapshot--no .verdict{font-size:clamp(13rem,42vw,48rem);letter-spacing:-.12em;text-indent:-.12em;transform:scaleX(1.08) rotate(-.7deg)}.snapshot--unknown .verdict{font-size:clamp(3.4rem,15vw,11rem);font-weight:420;letter-spacing:0;text-indent:0;white-space:nowrap;opacity:.42}.affected{margin-top:clamp(22px,3vw,38px)}
    .checked,.comparison,.action{position:absolute;z-index:5;bottom:clamp(18px,2.4vw,34px)}.checked{left:clamp(18px,2.4vw,40px);margin:0}.comparison{left:50%;transform:translateX(-50%);white-space:nowrap}.action{right:clamp(18px,2.4vw,40px);display:inline-flex;align-items:center;gap:6px;color:var(--label-ink);text-decoration:none;transition:transform 180ms ease}.action:hover,.action:focus-visible{transform:translateY(-1px)}.action svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.35}
    :focus-visible{outline:2px solid #0b58ff;outline-offset:4px}
    @media(prefers-color-scheme:dark){:root{--ink:#f3f0e8;--hairline:rgba(243,240,232,.24);--tone-a:#071915;--tone-b:#17453a;--tone-c:#7a654c;--tone-d:#395c48;--label-bg:rgba(5,8,6,.78);--label-ink:#f3f0e8}.snapshot--no{--tone-a:#17090a;--tone-b:#4f1017;--tone-c:#af2932;--tone-d:#80602d}.snapshot--unknown{--tone-a:#0c0d0b;--tone-b:#292a24;--tone-c:#656452;--tone-d:#171712}.shader{filter:saturate(.74) contrast(1.14) brightness(.84)}.snapshot--no .shader{filter:saturate(.9) contrast(1.28) brightness(.72)}:focus-visible{outline-color:#8ab4ff}}
    @media(max-width:700px){.masthead{left:72px;right:72px}.snapshot-label{font-size:0}.snapshot-label::after{content:'SNAPSHOT';font-size:9px;letter-spacing:.06em}.answer{align-content:start;padding-top:clamp(156px,27svh,230px)}.verdict{font-size:clamp(9rem,45vw,18rem)}.snapshot--no .verdict{font-size:clamp(12rem,58vw,22rem)}.affected{margin-top:20px;font-size:10px}.comparison{bottom:54px}.checked{max-width:58%;font-size:9px;letter-spacing:.04em}.action{font-size:9px;letter-spacing:.05em}}
    @media(max-height:500px) and (orientation:landscape){.masthead,.snapshot-label{top:12px}.answer{align-content:center;padding:48px 20px 54px}.verdict{font-size:min(37vw,14rem)}.snapshot--no .verdict{font-size:min(43vw,14rem)}.affected{margin-top:12px}.checked,.comparison,.action{bottom:10px}}
    @media (prefers-reduced-motion:reduce){.shader,.shader::before{animation:none}}
  </style>
</head>
<body>
  <main class="snapshot snapshot--${snapshot.answer}">
    <div class="shader" aria-hidden="true"></div>
    <div class="veil" aria-hidden="true"></div>
    <header class="masthead"><span class="wordmark">CAN I WORK NOW</span></header>
    <div class="snapshot-label">STATUS SNAPSHOT</div>
    <section class="answer" aria-labelledby="snapshot-verdict">
      <h1 class="verdict" id="snapshot-verdict">${answer}</h1>
      ${affected ? `<div class="affected"><span>AFFECTED</span> · ${escapeHtml(affected)}</div>` : ''}
    </section>
    <p class="checked">${escapeHtml(checked)}</p>
    <div class="comparison" id="comparison" role="status" aria-live="polite">CHECKING LIVE</div>
    <a class="action" href="/"><span>View live status</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6.5 5H11v4.5"/></svg></a>
  </main>
  <script>const snapshot=${state};const comparison=document.querySelector('#comparison');const setComparison=(text,state)=>{comparison.textContent=text;comparison.dataset.state=state};fetch('/api/status',{headers:{accept:'application/json'}}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(current=>{const currentAffected=current.services.filter(service=>service.health==='outage'||service.health==='degraded').map(service=>service.id).join(',');const snapshotAffected=snapshot.affected.join(',');const changed=current.answer!==snapshot.answer||currentAffected!==snapshotAffected;const newer=Date.parse(current.checkedAt)>Date.parse(snapshot.checkedAt);const currentAnswer=current.answer.toUpperCase();if(changed){setComparison('CURRENTLY '+currentAnswer+' · STATUS CHANGED','changed')}else if(newer){setComparison('STILL '+currentAnswer+' · NEWER CHECK','current')}else{setComparison('STILL '+currentAnswer,'current')}}).catch(()=>setComparison('LIVE CHECK UNAVAILABLE','error'))</script>
</body>
</html>`
}
