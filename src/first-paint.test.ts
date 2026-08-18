import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(fileURLToPath(new URL('./App.css', import.meta.url)), 'utf8')
const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const mainSource = readFileSync(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf8')
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

  it('renders live and snapshot states through the same instrument', () => {
    expect(mainSource).toContain('<App snapshot={snapshot} />')
    expect(appSource).toContain("snapshot ? ' snapshot-view' : ''")
    expect(appSource.match(/<GrainGradient/g)).toHaveLength(1)
    expect(appSource.match(/className="answer__word"/g)).toHaveLength(1)
    expect(appSource.match(/<Systems services=/g)).toHaveLength(1)
  })

  it('keeps snapshot metadata quiet and avoids revealing newer live status', () => {
    const timestampRule = appCss.match(/\.snapshot-timestamp\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const actionRule = appCss.match(/\.snapshot-action\s*\{([\s\S]*?)\}/)?.[1] ?? ''

    expect(appSource).not.toContain('className="snapshot-marker"')
    expect(appCss).not.toContain('.snapshot-marker')
    expect(timestampRule).toContain('opacity: 0.76')
    expect(timestampRule).not.toContain('background:')
    expect(timestampRule).not.toContain('border-radius:')
    expect(actionRule).toContain('background: var(--panel)')
    expect(actionRule).toContain('justify-content: space-between')
    expect(actionRule).not.toContain('border-radius:')
    expect(appCss).toMatch(/\.answer__word\s*\{[\s\S]*?grid-area:\s*1 \/ 1/)
    expect(appCss).toMatch(/\.snapshot-meta\s*\{[\s\S]*?grid-area:\s*1 \/ 1/)
    expect(appSource).toContain('SNAPSHOT AT {snapshotMoment}')
    expect(appSource).toContain('className="snapshot-action"')
    expect(appSource).not.toContain('snapshot-context')
    expect(appSource).not.toContain('snapshotMatchesLive')
    expect(appSource).not.toContain('STILL ${status.answer')
  })

  it('shows immutable incident specifics only on no snapshots', () => {
    expect(appSource).toContain("{answer === 'no' && (")
    expect(appSource).toContain('className="snapshot-incident"')
    expect(appSource).toContain('POINT IN TIME')
    expect(appSource).toContain('issue.name')
    expect(appSource).toContain('issue.detail')
  })

  it('renders the established DUNNO verdict for unknown snapshots without changing live loading', () => {
    expect(appSource).toContain('snapshot ? snapshotAnswerWord(answer) : displayAnswer(answer)')
    expect(appSource).toContain('snapshotAnswerWord')
    expect(appCss).toMatch(/\.instrument--unknown \.answer__word\s*\{[\s\S]*?opacity:\s*1/)
  })

  it('keeps the mobile dashboard within the small viewport', () => {
    expect(appCss).toContain('height: 100svh')
    expect(appCss).not.toMatch(/body\s*\{\s*overflow:\s*auto/)
    expect(appCss).not.toContain('min-height: max(100svh, 740px)')
  })

  it('creates a snapshot only after an intentional share', () => {
    expect(appSource).toContain("fetch('/api/share'")
    expect(appSource).toContain("method: 'POST'")
    expect(appSource).toContain('navigator.share')
    expect(appSource).toContain('navigator.clipboard?.writeText')
    expect(appSource).toContain("document.execCommand('copy')")
    expect(appSource).toContain('if ((coarsePointer || compact) && navigator.share)')
    expect(appSource).toContain('liveResolved')
    expect(appSource).not.toContain('snapshot.answer !== answer')
    expect(appSource).not.toContain('snapshot.checkedAt !== checkedAt')
    expect(appSource).toContain("Snapshot URL is invalid")
    expect(appSource).not.toContain('preloadSnapshot')
    expect(appSource).not.toContain('shareSnapshot')
    expect(appSource).toContain('aria-label="Share current status snapshot"')
    expect(appSource).toContain('className="share-status__icon"')
    expect(appSource).toContain('className="share-status__label"')
    expect(appSource).toContain("shareState === 'sharing'")
    expect(appSource).toContain("shareState === 'copied'")
    expect(appSource).toContain("shareState === 'error'")
    expect(appCss).not.toContain('font: 650 10px/1 inherit')
    expect(appCss).toContain('.share-status__label')
    expect(appCss).not.toContain('.share-feedback')
  })

  it('matches the mobile share glyph to the wordmark cap height', () => {
    const compactMedia = appCss.match(/@media \(pointer: coarse\), \(max-width: 700px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    const shareRule = compactMedia.match(/\.share-status\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const iconRule = compactMedia.match(/\.share-status__icon\s*\{([\s\S]*?)\}/)?.[1] ?? ''

    expect(appCss).toMatch(/\.wordmark\s*\{[\s\S]*?font-size:\s*11px/)
    expect(shareRule).toContain('top: max(14px, calc(clamp(18px, 2.4vw, 36px) - 4px))')
    expect(iconRule).toContain('width: 11px')
    expect(iconRule).toContain('height: 11px')
  })

  it('describes affected services in one centered incident-panel label', () => {
    expect(appSource).toContain("issues.length === 1 ? '1 SERVICE AFFECTED'")
    expect(appSource).toContain("`${issues.length} SERVICES AFFECTED`")
    expect(appSource).not.toContain('CURRENT SIGNAL')
    expect(appSource).not.toContain("String(issues.length).padStart(2, '0')")
    expect(appCss).toMatch(/\.issue-panel__heading\s*\{[\s\S]*?place-items:\s*center/)
  })

  it('enables incident-list scrolling only after expansion settles', () => {
    expect(appSource).toContain('panelScrollable')
    expect(appSource).toContain('onTransitionEnd')
    expect(appSource).toContain('window.setTimeout(() => setPanelScrollable(true), 320)')
    expect(appCss).toMatch(/\.issue-list\s*\{[\s\S]*?overflow-y:\s*hidden/)
    expect(appCss).toContain(".issue-panel[data-scrollable='true'] .issue-list")
  })

  it('preloads the exact primary font used by the app', () => {
    expect(indexHtml).toContain('rel="preload"')
    expect(indexHtml).toContain('/fonts/instrument-sans-latin-wght-normal.woff2')
  })
})
