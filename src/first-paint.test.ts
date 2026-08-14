import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(fileURLToPath(new URL('./App.css', import.meta.url)), 'utf8')
const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const indexHtml = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')

describe('first paint stability', () => {
  it('does not animate answer geometry when live status arrives', () => {
    const answerRule = appCss.match(/\.answer__word\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    expect(answerRule).not.toMatch(/transition:[\s\S]*(font-size|letter-spacing|transform)/)
  })

  it('does not fade the healthy shader in from the unknown state', () => {
    expect(appCss).not.toMatch(/\.instrument--unknown \.shader\s*\{/)
  })

  it('uses a shader-like fallback before WebGL paints', () => {
    expect(appCss).toContain('background: var(--surface-fallback)')
  })

  it('keeps the mobile dashboard within the small viewport', () => {
    expect(appCss).toContain('height: 100svh')
    expect(appCss).not.toMatch(/body\s*\{\s*overflow:\s*auto/)
    expect(appCss).not.toContain('min-height: max(100svh, 740px)')
  })

  it('preloads snapshots and keeps sharing visually stable', () => {
    expect(appSource).toContain("fetch('/api/share'")
    expect(appSource).toContain('navigator.share')
    expect(appSource).toContain('navigator.clipboard.writeText')
    expect(appSource).toContain('if ((coarsePointer || compact) && navigator.share)')
    expect(appSource).toContain('liveResolved')
    expect(appSource).toContain('snapshot.answer === answer')
    expect(appSource).toContain('setShareSnapshot(null)')
    expect(appSource).toContain('aria-label="Share current status snapshot"')
    expect(appSource).toContain('className="share-status__icon"')
    expect(appSource).toContain('className="share-status__label"')
    expect(appSource).not.toContain("'creating'")
    expect(appSource).not.toContain('CREATING')
    expect(appCss).not.toContain('font: 650 10px/1 inherit')
    expect(appCss).toContain('.share-status__label')
  })

  it('preloads the exact primary font used by the app', () => {
    expect(indexHtml).toContain('rel="preload"')
    expect(indexHtml).toContain('/fonts/instrument-sans-latin-wght-normal.woff2')
  })
})
