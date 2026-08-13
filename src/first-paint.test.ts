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

  it('keeps the issue panel stationary and clear of the system rail', () => {
    const panelRule = appCss.match(/\.issue-panel\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    expect(panelRule).toContain('bottom:')
    expect(panelRule).not.toContain('will-change: transform')
    expect(appSource).not.toContain('panelRef')
    expect(appSource).not.toContain('panel.style.transform')
  })

  it('does not show an issue count in the panel heading', () => {
    expect(appSource).not.toContain("String(issues.length).padStart(2, '0')")
  })

  it('preloads the exact primary font used by the app', () => {
    expect(indexHtml).toContain('rel="preload"')
    expect(indexHtml).toContain('/fonts/instrument-sans-latin-wght-normal.woff2')
  })
})
