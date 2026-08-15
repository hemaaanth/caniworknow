import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  formatSnapshotChecked,
  snapshotAnswerWord,
  type StatusSnapshot,
} from './snapshot-v3.js'

const WIDTH = 1200
const HEIGHT = 630
const META_EDGE = 48
export const SOCIAL_CARD_TYPE = { masthead: 34, metadata: 24, yes: 380, no: 440, dunno: 290 } as const
const SNAPSHOT_FONT_PATH = fileURLToPath(new URL('../public/fonts/instrument-sans-variable.ttf', import.meta.url))
type Overlay = Parameters<ReturnType<typeof sharp>['composite']>[0][number]
type Palette = {
  back: string
  middle: string
  ribbon: string
  ribbonAlt: string
  glow: string
  ink: string
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

type TextAlign = 'left' | 'center' | 'right'
type VerticalAlign = 'top' | 'center'

export function alignedTextLeft(boxLeft: number, boxWidth: number, textWidth: number, align: TextAlign): number {
  if (align === 'center') return Math.round(boxLeft + (boxWidth - textWidth) / 2)
  if (align === 'right') return Math.round(boxLeft + boxWidth - textWidth)
  return boxLeft
}

export function alignedTextTop(boxTop: number, boxHeight: number, textHeight: number, align: VerticalAlign): number {
  if (align === 'center') return Math.round(boxTop + (boxHeight - textHeight) / 2)
  return boxTop
}

async function textLayer(
  text: string,
  options: {
    left: number
    top: number
    width: number
    height?: number
    size: number
    weight: number
    color: string
    align?: TextAlign
    verticalAlign?: VerticalAlign
    spacing?: number
  },
): Promise<Overlay> {
  const spacing = options.spacing === undefined ? '' : ` letter_spacing="${Math.round(options.spacing * 1024)}"`
  const markup = `<span foreground="${options.color}" weight="${options.weight}"${spacing}>${escapeXml(text)}</span>`
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `Instrument Sans ${options.size}`,
      fontfile: SNAPSHOT_FONT_PATH,
      rgba: true,
    },
  }).png().toBuffer({ resolveWithObject: true })
  const align = options.align ?? 'left'
  const top = options.height === undefined
    ? options.top
    : alignedTextTop(options.top, options.height, info.height, options.verticalAlign ?? 'top')

  return {
    input: data,
    left: alignedTextLeft(options.left, options.width, info.width, align),
    top,
  }
}

async function metaLayer(text: string, side: 'left' | 'right', color: string): Promise<Overlay> {
  return textLayer(text, {
    left: side === 'left' ? META_EDGE : 652,
    top: 530,
    width: 500,
    height: 60,
    size: SOCIAL_CARD_TYPE.metadata,
    weight: 620,
    color,
    align: side,
    verticalAlign: 'center',
    spacing: 1.05,
  })
}

async function createGrainOverlay(seed: number): Promise<Buffer> {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4)
  let state = seed >>> 0

  for (let offset = 0; offset < pixels.length; offset += 4) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const value = state & 0xff
    pixels[offset] = value
    pixels[offset + 1] = value
    pixels[offset + 2] = value
    pixels[offset + 3] = 92
  }

  return sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer()
}

function backgroundSvg(palette: Palette, answer: StatusSnapshot['answer']): string {
  const ribbons = answer === 'no'
    ? `
      <path d="M-170 510 C80 205 270 160 478 292 S785 564 1046 368 S1308 80 1390 152" stroke="${palette.ribbon}" stroke-width="154"/>
      <path d="M-90 76 C180 -66 326 12 442 160 S664 320 822 142 S1090 -84 1320 52" stroke="${palette.ribbonAlt}" stroke-width="118" opacity=".82"/>
      <path d="M846 690 C704 526 714 390 846 304 S1094 186 1262 278" stroke="${palette.glow}" stroke-width="92" opacity=".56"/>`
    : answer === 'yes'
      ? `
        <path d="M-178 414 C88 98 300 42 510 210 S844 558 1088 356 S1302 42 1416 116" stroke="${palette.ribbon}" stroke-width="176"/>
        <path d="M-126 70 C150 -66 364 -8 472 128 S658 292 824 166 S1112 -46 1362 36" stroke="${palette.ribbonAlt}" stroke-width="126" opacity=".78"/>
        <path d="M772 718 C650 554 680 394 838 308 S1118 214 1320 336" stroke="${palette.glow}" stroke-width="96" opacity=".48"/>`
      : `
        <path d="M-164 500 C66 216 304 124 508 278 S828 532 1050 364 S1286 108 1402 158" stroke="${palette.ribbon}" stroke-width="160"/>
        <path d="M-108 64 C142 -48 354 -12 482 148 S690 304 858 154 S1122 -42 1360 54" stroke="${palette.ribbonAlt}" stroke-width="116" opacity=".7"/>
        <path d="M808 704 C688 536 714 396 862 314 S1110 224 1304 314" stroke="${palette.glow}" stroke-width="88" opacity=".38"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <radialGradient id="base" cx="46%" cy="42%" r="84%">
        <stop offset="0" stop-color="${palette.middle}"/>
        <stop offset=".58" stop-color="${palette.back}"/>
        <stop offset="1" stop-color="#030303"/>
      </radialGradient>
      <radialGradient id="light" cx="18%" cy="10%" r="80%">
        <stop stop-color="${palette.glow}" stop-opacity=".3"/>
        <stop offset=".62" stop-color="${palette.back}" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft" x="-20%" y="-30%" width="140%" height="160%">
        <feGaussianBlur stdDeviation="5"/>
      </filter>
      <linearGradient id="veil" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#fff" stop-opacity=".05"/>
        <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".38"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#base)"/>
    <g fill="none" stroke-linecap="round" filter="url(#soft)">${ribbons}</g>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#light)"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#veil)"/>
  </svg>`
}

export async function renderSnapshotPng(snapshot: StatusSnapshot): Promise<Buffer> {
  const answer = snapshot.answer === 'unknown' ? 'DUNNO' : snapshotAnswerWord(snapshot.answer)
  const checked = formatSnapshotChecked(snapshot.checkedAt).toUpperCase()
  const affected = snapshot.affected.map((service) => service.toUpperCase())
  const palette: Palette = snapshot.answer === 'no'
    ? { back: '#100607', middle: '#26090d', ribbon: '#a41f2e', ribbonAlt: '#dc694f', glow: '#bd853f', ink: '#f4f0e7' }
    : snapshot.answer === 'yes'
      ? { back: '#030b08', middle: '#0b211a', ribbon: '#3c735e', ribbonAlt: '#9b7651', glow: '#8dbba3', ink: '#f4f0e7' }
      : { back: '#080806', middle: '#1b1b16', ribbon: '#595947', ribbonAlt: '#8d7357', glow: '#8b8871', ink: '#f4f0e7' }
  const verdict = snapshot.answer === 'unknown'
    ? { size: SOCIAL_CARD_TYPE.dunno, weight: 850, spacing: -10 }
    : snapshot.answer === 'no'
      ? { size: SOCIAL_CARD_TYPE.no, weight: 850, spacing: -18 }
      : { size: SOCIAL_CARD_TYPE.yes, weight: 850, spacing: -15 }
  const affectedCount = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR'][affected.length] ?? String(affected.length)
  const statusMeta = affected.length > 0
    ? `${affectedCount} ${affected.length === 1 ? 'SERVICE' : 'SERVICES'} AFFECTED`
    : snapshot.answer === 'yes'
      ? 'ALL SERVICES OPERATIONAL'
      : snapshot.answer === 'no'
        ? 'ISSUE DETAILS UNAVAILABLE'
        : 'STATUS PARTIALLY UNKNOWN'
  const grain = await createGrainOverlay(snapshot.answer === 'no' ? 0x9e3779b9 : snapshot.answer === 'yes' ? 0x85ebca6b : 0xc2b2ae35)
  const [mastheadLayer, verdictLayer, checkedLayer, statusLayer] = await Promise.all([
    textLayer('CAN I WORK NOW', {
      left: 300, top: 30, width: 600, size: SOCIAL_CARD_TYPE.masthead, weight: 650, color: palette.ink, align: 'center', spacing: 2.2,
    }),
    textLayer(answer, {
      left: 50, top: 90, width: 1100, height: 450, size: verdict.size, weight: verdict.weight, color: palette.ink, align: 'center', verticalAlign: 'center', spacing: verdict.spacing,
    }),
    metaLayer(checked, 'left', palette.ink),
    metaLayer(statusMeta, 'right', palette.ink),
  ])
  const overlays: Overlay[] = [
    { input: grain, blend: 'overlay' },
    mastheadLayer,
    verdictLayer,
    checkedLayer,
    statusLayer,
  ]

  return sharp(Buffer.from(backgroundSvg(palette, snapshot.answer)))
    .composite(overlays)
    .png({ compressionLevel: 9, palette: true, quality: 92, colours: 256, dither: 0.8 })
    .toBuffer()
}
