import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { LiveStatusResponse } from '../src/lib/status.js'
import {
  createStatusSnapshot,
  parseStatusSnapshot,
  renderSnapshotHtml,
  snapshotUrl,
} from './snapshot.js'
import { renderSnapshotPng } from './snapshot-image.js'
import { renderSnapshotHtml as renderSnapshotHtmlV3 } from './snapshot-v3.js'

const SECRET = 'test-secret-with-enough-entropy'
const snapshotImageV3Source = readFileSync(fileURLToPath(new URL('./snapshot-image-v3.ts', import.meta.url)), 'utf8')
const status: LiveStatusResponse = {
  answer: 'no',
  checkedAt: '2026-08-14T00:30:00.000Z',
  services: [
    {
      id: 'claude',
      name: 'Claude',
      health: 'outage',
      detail: 'Claude API has an outage',
      sources: [],
      links: [],
    },
    {
      id: 'github',
      name: 'GitHub',
      health: 'operational',
      detail: 'No current problems detected',
      sources: [],
      links: [],
    },
  ],
}

describe('status snapshots', () => {
  it('versions the immutable snapshot presentation path', () => {
    expect(snapshotUrl('signed-token')).toBe('/s/v2/signed-token')
  })

  it('creates a compact signed immutable snapshot', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)

    expect(snapshot).toEqual({
      v: 1,
      answer: 'no',
      checkedAt: '2026-08-14T00:30:00.000Z',
      capturedAt: '2026-08-14T00:31:00.000Z',
      affected: ['claude'],
    })
    expect(token.length).toBeLessThan(240)
    expect(parseStatusSnapshot(`${token.slice(0, -1)}x`, SECRET)).toBeNull()
    expect(parseStatusSnapshot(token, 'a-different-secret')).toBeNull()
  })

  it('renders metadata for an eight-character stored snapshot id', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    expect(snapshot).not.toBeNull()
    const html = renderSnapshotHtmlV3(snapshot!, 'A1b2C3d4', 'https://caniworknow.com', {
      snapshotPath: '/s/A1b2C3d4',
      imagePath: '/api/og-v3?id=A1b2C3d4',
    })

    expect(html).toContain('rel="canonical" href="https://caniworknow.com/s/A1b2C3d4"')
    expect(html).toContain('property="og:image" content="https://caniworknow.com/api/og-v3?id=A1b2C3d4"')
    expect(html).not.toContain('/s/v2/A1b2C3d4')
  })

  it('renders immutable social metadata and a live-status comparison page', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    expect(snapshot).not.toBeNull()

    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain('<meta property="og:title" content="NO — Can I Work Now?"')
    expect(html).toContain('Claude had a current issue')
    expect(html).toContain('Checked Aug 14, 2026 · 00:30 UTC')
    expect(html).toContain(`https://caniworknow.com${snapshotUrl(token)}`)
    expect(html).toContain('/api/og-v2?token=')
    expect(html).toContain('CHECKING LIVE')
    expect(html).toContain('View live status')
    expect(html).toContain("fetch('/api/status'")
  })

  it('renders a minimal full-screen snapshot in the live dashboard style', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')
    const body = html.slice(html.indexOf('<body>'))

    expect(body).toContain('class="snapshot snapshot--no"')
    expect(body).toContain('class="shader"')
    expect(body).toContain('class="verdict"')
    expect(body).toContain('class="comparison"')
    expect(body).toContain('STATUS SNAPSHOT')
    expect(body).toContain('Checked Aug 14, 2026 · 00:30 UTC')
    expect(body).toContain('View live status')
    expect(body).not.toContain('class="detail"')
    expect(body).not.toContain('This shared snapshot')
    expect(body).not.toContain('The current verdict is')
    expect(html).toContain('@keyframes shader-drift')
    expect(html).toContain('@media (prefers-reduced-motion:reduce)')
    expect(html).toContain("font-family:'Instrument Sans Variable'")
    expect(html).toContain("font-weight:400 700;src:url('/fonts/instrument-sans-latin-wght-normal.woff2')")
    expect(html).not.toContain('width:min(680px,100%)')
  })

  it('keeps the UNKNOWN verdict within compact viewports', () => {
    const unknown = { ...status, answer: 'unknown' as const, services: [] }
    const token = createStatusSnapshot(unknown, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain('.snapshot--unknown .verdict{font-size:clamp(3.4rem,15vw,11rem)')
    expect(html).toContain('white-space:nowrap')
  })

  it('shortens the mobile snapshot marker to protect the wordmark', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain(".snapshot-label::after{content:'SNAPSHOT'")
  })

  it('fits the snapshot composition in short landscape viewports', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain('@media(max-height:500px) and (orientation:landscape)')
    expect(html).toContain('.snapshot--no .verdict{font-size:min(43vw,14rem)}')
    expect(html).toContain('.affected{margin-top:12px}')
  })

  it('labels affected services without restoring explanatory copy', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain('<div class="affected"><span>AFFECTED</span> · Claude</div>')
  })

  it('keeps peripheral status text readable over every shader region', () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const html = renderSnapshotHtml(snapshot!, token, 'https://caniworknow.com')

    expect(html).toContain('--label-bg:rgba(244,239,226,.84);--label-ink:#11100e')
    expect(html).toContain('.snapshot-label,.checked,.comparison,.action,.affected{color:var(--label-ink);background:var(--label-bg)')
    expect(html).toContain('--label-bg:rgba(5,8,6,.78);--label-ink:#f3f0e8')
  })

  it('renders OG text with a Vercel-compatible bundled TrueType font', () => {
    expect(snapshotImageV3Source).toContain("new URL('../public/fonts/instrument-sans-variable.ttf', import.meta.url)")
    expect(snapshotImageV3Source).toContain('fontfile: SNAPSHOT_FONT_PATH')
    expect(snapshotImageV3Source).not.toContain('instrument-sans-latin-wght-normal.woff2')
    expect(snapshotImageV3Source).not.toContain('Arial, Helvetica, sans-serif')
    expect(snapshotImageV3Source).not.toContain('<text')
  })

  it('keeps checked time and affected services visually separated', async () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const png = await renderSnapshotPng(snapshot!)
    const { data, info } = await sharp(png)
      .extract({ left: 570, top: 535, width: 60, height: 75 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    let inkPixels = 0

    for (let index = 0; index < data.length; index += info.channels) {
      if (data[index] > 220 && data[index + 1] > 220 && data[index + 2] > 220) inkPixels += 1
    }

    expect(inkPixels).toBeLessThan(20)
  })

  it('renders a timestamped 1200×630 PNG social card', async () => {
    const token = createStatusSnapshot(status, SECRET, '2026-08-14T00:31:00.000Z')
    const snapshot = parseStatusSnapshot(token, SECRET)
    const png = await renderSnapshotPng(snapshot!)

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(png.byteLength).toBeLessThan(500_000)
  })
})
