import { useEffect, useMemo, useRef, useState } from 'react'
import { GrainGradient } from '@paper-design/shaders-react'
import { mockIssues } from './data/issues'
import './App.css'

type StatusMode = 'up' | 'down'

type MediaState = {
  dark: boolean
  reducedMotion: boolean
  coarsePointer: boolean
}

const readMedia = (): MediaState => ({
  dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  coarsePointer: window.matchMedia('(pointer: coarse)').matches,
})

function useMediaState() {
  const [media, setMedia] = useState<MediaState>(readMedia)

  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-color-scheme: dark)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(pointer: coarse)'),
    ]
    const update = () => setMedia(readMedia())
    queries.forEach((query) => query.addEventListener('change', update))
    return () => queries.forEach((query) => query.removeEventListener('change', update))
  }, [])

  return media
}

function App() {
  const [mode, setMode] = useState<StatusMode>(() =>
    new URLSearchParams(window.location.search).get('state') === 'down' ? 'down' : 'up',
  )
  const [shaderOffset, setShaderOffset] = useState({ x: 0, y: 0 })
  const { dark, reducedMotion, coarsePointer } = useMediaState()
  const panelRef = useRef<HTMLElement>(null)
  const targetRef = useRef({ x: window.innerWidth * 0.64, y: window.innerHeight * 0.52 })
  const currentRef = useRef({ ...targetRef.current })
  const panelHoverRef = useRef(false)
  const pointerFrame = useRef<number | null>(null)

  const shader = useMemo(() => {
    if (mode === 'up') {
      return dark
        ? { colors: ['#071915', '#17453a', '#395c48', '#7a654c'], back: '#050806' }
        : { colors: ['#f4efe2', '#bfddcf', '#83c3aa', '#f0bea0'], back: '#f4efe2' }
    }
    return dark
      ? { colors: ['#17090a', '#4f1017', '#af2932', '#80602d'], back: '#090505' }
      : { colors: ['#f2e5da', '#eb7358', '#a31728', '#d9a342'], back: '#f2e5da' }
  }, [dark, mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key.toLowerCase() === 'y') setMode('up')
      if (event.key.toLowerCase() === 'n') setMode('down')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (mode !== 'down' || coarsePointer) return

    let frame = 0
    const animate = () => {
      const panel = panelRef.current
      if (panel) {
        const ease = reducedMotion ? 1 : 0.14
        currentRef.current.x += (targetRef.current.x - currentRef.current.x) * ease
        currentRef.current.y += (targetRef.current.y - currentRef.current.y) * ease
        panel.style.transform = `translate3d(${currentRef.current.x}px, ${currentRef.current.y}px, 0)`
      }
      frame = window.requestAnimationFrame(animate)
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [coarsePointer, mode, reducedMotion])

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (coarsePointer || panelHoverRef.current) return

    const panelWidth = panelRef.current?.offsetWidth ?? 330
    const panelHeight = panelRef.current?.offsetHeight ?? 250
    const gap = 26
    const nextX = Math.min(event.clientX + gap, window.innerWidth - panelWidth - 18)
    const nextY = Math.min(event.clientY + gap, window.innerHeight - panelHeight - 18)
    targetRef.current = { x: Math.max(18, nextX), y: Math.max(18, nextY) }

    if (pointerFrame.current === null) {
      pointerFrame.current = window.requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth - 0.5
        const y = event.clientY / window.innerHeight - 0.5
        setShaderOffset({ x: x * 0.22, y: y * 0.22 })
        pointerFrame.current = null
      })
    }
  }

  return (
    <main className={`instrument instrument--${mode}`} onPointerMove={handlePointerMove}>
      <div className="shader" aria-hidden="true">
        <GrainGradient
          width="100%"
          height="100%"
          colors={shader.colors}
          colorBack={shader.back}
          softness={mode === 'up' ? 0.62 : 0.38}
          intensity={mode === 'up' ? 0.48 : 0.68}
          noise={dark ? 0.22 : 0.16}
          shape={mode === 'up' ? 'corners' : 'truchet'}
          speed={reducedMotion ? 0 : mode === 'up' ? 0.16 : 0.04}
          scale={mode === 'up' ? 0.9 : 1.62}
          rotation={mode === 'up' ? -8 : 13}
          offsetX={shaderOffset.x}
          offsetY={shaderOffset.y}
          minPixelRatio={1}
          maxPixelCount={coarsePointer ? 620_000 : 1_250_000}
        />
      </div>
      <div className="veil" aria-hidden="true" />

      <header className="masthead">
        <span className="wordmark">caniworknow.com</span>
        <span className="prototype-label">Design prototype · 01</span>
      </header>

      <section className="answer" aria-live="polite" aria-atomic="true">
        <p className="answer__context">Can I work now?</p>
        <h1 className="answer__word">{mode === 'up' ? 'YES' : 'NO'}</h1>
        <p className="sr-only">
          {mode === 'up'
            ? 'Yes. GitHub, Cloudflare, Claude, and Codex are operational.'
            : 'No. Claude and GitHub Actions have mocked service issues.'}
        </p>
      </section>

      <footer className="utility">
        <p className="checked">
          <span className="status-dot" aria-hidden="true" />
          {mode === 'up' ? '4 systems checked · just now' : '2 issues reported · mock data'}
        </p>
        <div className="state-switch" role="group" aria-label="Prototype status state">
          <span className="state-switch__label">Preview</span>
          <button
            type="button"
            className={mode === 'up' ? 'is-active' : ''}
            onClick={() => setMode('up')}
            aria-pressed={mode === 'up'}
            title="Show operational state (Y)"
          >
            Up <kbd>Y</kbd>
          </button>
          <button
            type="button"
            className={mode === 'down' ? 'is-active' : ''}
            onClick={() => setMode('down')}
            aria-pressed={mode === 'down'}
            title="Show incident state (N)"
          >
            Down <kbd>N</kbd>
          </button>
        </div>
      </footer>

      {mode === 'down' && (
        <aside
          className="issue-panel"
          ref={panelRef}
          aria-label="Current service issues"
          onPointerEnter={() => {
            panelHoverRef.current = true
          }}
          onPointerLeave={() => {
            panelHoverRef.current = false
          }}
        >
          <div className="issue-panel__heading">
            <span>What’s down</span>
            <span>02</span>
          </div>
          <div className="issue-list">
            {mockIssues.map((issue, index) => (
              <article className="issue" key={issue.id}>
                <div className="issue__index">0{index + 1}</div>
                <div>
                  <h2>{issue.service}</h2>
                  <p>{issue.summary}</p>
                  <div className="issue__sources">
                    {issue.sources.map((source) => (
                      <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                        {source.label}<span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </aside>
      )}
    </main>
  )
}

export default App
