import sharp from 'sharp'
import {
  formatSnapshotChecked,
  snapshotAnswerWord,
  snapshotIssueLabel,
  type StatusSnapshot,
} from './snapshot.js'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function renderSnapshotPng(snapshot: StatusSnapshot): Promise<Buffer> {
  const answer = snapshotAnswerWord(snapshot.answer)
  const detail = snapshotIssueLabel(snapshot)
  const checked = formatSnapshotChecked(snapshot.checkedAt)
  const palette = snapshot.answer === 'no'
    ? { back: '#2a0b0e', middle: '#a31728', glow: '#eb7358', ink: '#fff1e8' }
    : snapshot.answer === 'yes'
      ? { back: '#071915', middle: '#347d68', glow: '#a8d3bf', ink: '#edf5eb' }
      : { back: '#171712', middle: '#656452', glow: '#d6cfad', ink: '#f4efe2' }
  const answerSize = snapshot.answer === 'unknown' ? 190 : 330
  const answerSpacing = snapshot.answer === 'unknown' ? -8 : -22
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><radialGradient id="g" cx="28%" cy="20%" r="100%"><stop offset="0" stop-color="${palette.glow}"/><stop offset=".46" stop-color="${palette.middle}"/><stop offset="1" stop-color="${palette.back}"/></radialGradient><linearGradient id="veil" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".12"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#veil)"/>
    <g fill="${palette.ink}" font-family="Arial, Helvetica, sans-serif">
      <text x="64" y="74" font-size="20" font-weight="700" letter-spacing="3">CAN I WORK NOW · STATUS SNAPSHOT</text>
      <text x="54" y="420" font-size="${answerSize}" font-weight="900" letter-spacing="${answerSpacing}">${escapeXml(answer)}</text>
      <text x="66" y="520" font-size="30" font-weight="700">${escapeXml(detail)}</text>
      <text x="66" y="566" font-size="22" opacity=".72">${escapeXml(checked)}</text>
    </g>
  </svg>`
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
