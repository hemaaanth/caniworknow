import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  formatSnapshotChecked,
  snapshotAnswerWord,
  type StatusSnapshot,
} from './snapshot-v3.js'

const SNAPSHOT_FONT_PATH = fileURLToPath(new URL('../public/fonts/instrument-sans-variable.ttf', import.meta.url))
type Overlay = Parameters<ReturnType<typeof sharp>['composite']>[0][number]

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function textLayer(
  text: string,
  options: {
    left: number
    top: number
    width: number
    height: number
    size: number
    weight: number
    color: string
    align?: 'left' | 'center' | 'right'
    spacing?: number
  },
): Overlay {
  const spacing = options.spacing === undefined ? '' : ` letter_spacing="${Math.round(options.spacing * 1024)}"`
  const markup = `<span foreground="${options.color}" weight="${options.weight}"${spacing}>${escapeXml(text)}</span>`

  return {
    input: {
      text: {
        text: markup,
        font: `Instrument Sans ${options.size}`,
        fontfile: SNAPSHOT_FONT_PATH,
        width: options.width,
        height: options.height,
        align: options.align ?? 'left',
        rgba: true,
      },
    },
    left: options.left,
    top: options.top,
  }
}

export async function renderSnapshotPng(snapshot: StatusSnapshot): Promise<Buffer> {
  const answer = snapshotAnswerWord(snapshot.answer)
  const checked = formatSnapshotChecked(snapshot.checkedAt)
  const affected = snapshot.affected.map((service) => service.toUpperCase()).join(' · ')
  const palette = snapshot.answer === 'no'
    ? { back: '#17090a', middle: '#4f1017', glow: '#af2932', accent: '#80602d', ink: '#f3f0e8' }
    : snapshot.answer === 'yes'
      ? { back: '#071915', middle: '#17453a', glow: '#527f69', accent: '#7a654c', ink: '#f3f0e8' }
      : { back: '#0c0d0b', middle: '#292a24', glow: '#656452', accent: '#171712', ink: '#f3f0e8' }
  const verdict = snapshot.answer === 'unknown'
    ? { size: 148, top: 220, left: 50, weight: 480, spacing: 0 }
    : snapshot.answer === 'no'
      ? { size: 340, top: 112, left: 260, weight: 850, spacing: -18 }
      : { size: 300, top: 132, left: 150, weight: 850, spacing: -15 }
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <radialGradient id="a" cx="14%" cy="18%" r="86%"><stop offset="0" stop-color="${palette.glow}"/><stop offset=".48" stop-color="${palette.middle}"/><stop offset="1" stop-color="${palette.back}"/></radialGradient>
      <radialGradient id="b" cx="88%" cy="18%" r="80%"><stop offset="0" stop-color="${palette.accent}" stop-opacity=".72"/><stop offset=".58" stop-color="${palette.middle}" stop-opacity=".24"/><stop offset="1" stop-color="${palette.back}" stop-opacity="0"/></radialGradient>
      <linearGradient id="veil" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".06"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#a)"/>
    <rect width="1200" height="630" fill="url(#b)"/>
    <rect width="1200" height="630" fill="url(#veil)"/>
    <rect x="1" y="1" width="1198" height="628" fill="none" stroke="${palette.ink}" stroke-opacity=".18"/>
  </svg>`
  const overlays: Overlay[] = [
    textLayer('CAN I WORK NOW', {
      left: 400, top: 46, width: 400, height: 34, size: 20, weight: 650, color: palette.ink, align: 'center', spacing: 2,
    }),
    textLayer('STATUS SNAPSHOT', {
      left: 928, top: 49, width: 216, height: 28, size: 17, weight: 650, color: palette.ink, align: 'right', spacing: 1.5,
    }),
    textLayer(answer, {
      left: verdict.left, top: verdict.top, width: 1100, height: 340, size: verdict.size, weight: verdict.weight, color: palette.ink, align: 'center', spacing: verdict.spacing,
    }),
    textLayer(checked.toUpperCase(), {
      left: 56, top: 558, width: 500, height: 26, size: 14, weight: 560, color: palette.ink, spacing: 0.55,
    }),
  ]

  if (affected) {
    overlays.push(textLayer(`AFFECTED · ${affected}`, {
      left: 650, top: 558, width: 494, height: 26, size: 14, weight: 650, color: palette.ink, align: 'right', spacing: 0.55,
    }))
  }

  return sharp(Buffer.from(background))
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer()
}
