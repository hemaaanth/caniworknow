import { useEffect, useMemo, useRef, useState } from 'react'
import { GrainGradient } from '@paper-design/shaders-react'
import {
  createFaviconSvg,
  displayAnswer,
  type Answer,
  type LiveStatusResponse,
  type ServiceId,
  type ServiceStatus,
} from './lib/status'
import './App.css'

type MediaState = {
  dark: boolean
  reducedMotion: boolean
  coarsePointer: boolean
  compact: boolean
}

const CACHE_KEY = 'caniworknow:live-status'
const CACHE_MAX_AGE_MS = 15 * 60 * 1000

const readMedia = (): MediaState => ({
  dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  compact: window.matchMedia('(max-width: 700px)').matches,
})

function useMediaState() {
  const [media, setMedia] = useState<MediaState>(readMedia)

  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-color-scheme: dark)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(max-width: 700px)'),
    ]
    const update = () => setMedia(readMedia())
    queries.forEach((query) => query.addEventListener('change', update))
    return () => queries.forEach((query) => query.removeEventListener('change', update))
  }, [])

  return media
}

function readCachedStatus(): LiveStatusResponse | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '') as LiveStatusResponse
    if (Date.now() - Date.parse(cached.checkedAt) > CACHE_MAX_AGE_MS) return null
    return cached
  } catch {
    return null
  }
}

function useLiveStatus() {
  const [status, setStatus] = useState<LiveStatusResponse | null>(readCachedStatus)
  const [liveResolved, setLiveResolved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    const refresh = async () => {
      try {
        const response = await fetch('/api/status', {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Status request failed: ${response.status}`)
        const next = await response.json() as LiveStatusResponse
        setStatus(next)
        setLiveResolved(true)
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus((current) => current ?? readCachedStatus())
      }
    }

    void refresh()
    const interval = window.setInterval(refresh, 300_000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])

  return { status, liveResolved }
}

function ServiceIcon({ id }: { id: ServiceId }) {
  const brand = id === 'codex' ? 'openai' : id
  return <span className={`brand-mark brand-mark--${brand}`} aria-hidden="true" />
}

function Systems({ services }: { services: ServiceStatus[] }) {
  return (
    <nav className="systems" aria-label="Systems monitored">
      {services.map((service) => (
        <a
          className="system-icon"
          data-health={service.health}
          data-tooltip={`${service.name} · ${service.health}`}
          href={service.links[0].url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${service.name}: ${service.health}. Open official status.`}
          key={service.id}
        >
          <ServiceIcon id={service.id} />
        </a>
      ))}
    </nav>
  )
}

const FALLBACK_SERVICES: ServiceStatus[] = (['github', 'cloudflare', 'claude', 'codex'] as ServiceId[]).map((id) => ({
  id,
  name: id === 'github' ? 'GitHub' : id === 'cloudflare' ? 'Cloudflare' : id === 'claude' ? 'Claude' : 'Codex',
  health: 'unknown',
  detail: 'Checking live status',
  sources: [],
  links: [{
    label: 'Official status',
    url: id === 'github'
      ? 'https://www.githubstatus.com/'
      : id === 'cloudflare'
        ? 'https://www.cloudflarestatus.com/'
        : id === 'claude'
          ? 'https://status.claude.com/'
          : 'https://status.openai.com/',
  }],
}))

function App() {
  const { status, liveResolved } = useLiveStatus()
  const answer: Answer = status?.answer ?? 'unknown'
  const services = status?.services ?? FALLBACK_SERVICES
  const checkedAt = status?.checkedAt
  const issues = services.filter((service) => service.health === 'outage' || service.health === 'degraded')
  const [shaderOffset, setShaderOffset] = useState({ x: 0, y: 0 })
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelScrollable, setPanelScrollable] = useState(false)
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'copied' | 'error'>('idle')
  const { dark, reducedMotion, coarsePointer, compact } = useMediaState()
  const pointerFrame = useRef<number | null>(null)

  const shader = useMemo(() => {
    if (answer !== 'no') {
      return dark
        ? { colors: ['#071915', '#17453a', '#395c48', '#7a654c'], back: '#050806' }
        : { colors: ['#f4efe2', '#bfddcf', '#83c3aa', '#f0bea0'], back: '#f4efe2' }
    }
    return dark
      ? { colors: ['#17090a', '#4f1017', '#af2932', '#80602d'], back: '#090505' }
      : { colors: ['#f2e5da', '#eb7358', '#a31728', '#d9a342'], back: '#f2e5da' }
  }, [answer, dark])

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ?? document.createElement('link')
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.href = `data:image/svg+xml,${encodeURIComponent(createFaviconSvg(answer))}`
    if (!icon.parentNode) document.head.appendChild(icon)
    document.title = `${answer === 'yes' ? 'YES' : answer === 'no' ? 'NO' : 'CHECKING'} — Can I Work Now`
  }, [answer])

  useEffect(() => {
    if (answer !== 'no') {
      setPanelOpen(false)
      setPanelScrollable(false)
    }
  }, [answer])

  useEffect(() => {
    if (!panelOpen) return
    const timeout = window.setTimeout(() => setPanelScrollable(true), 320)
    return () => window.clearTimeout(timeout)
  }, [panelOpen])

  useEffect(() => {
    if (answer !== 'no' || !panelOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanelScrollable(false)
        setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answer, panelOpen])

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!coarsePointer && pointerFrame.current === null) {
      const clientX = event.clientX
      const clientY = event.clientY
      pointerFrame.current = window.requestAnimationFrame(() => {
        setShaderOffset({
          x: (clientX / window.innerWidth - 0.5) * 0.18,
          y: (clientY / window.innerHeight - 0.5) * 0.18,
        })
        pointerFrame.current = null
      })
    }
  }

  const answerWord = displayAnswer(answer)
  const issueSummary = issues.length === 1 ? '1 SERVICE AFFECTED' : `${issues.length} SERVICES AFFECTED`

  const handlePanelToggle = () => {
    setPanelScrollable(false)
    setPanelOpen((open) => !open)
  }

  const handleShare = async () => {
    if (!liveResolved || !checkedAt || shareState === 'sharing') return
    setShareState('sharing')
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error(`Share request failed: ${response.status}`)
      const snapshot = await response.json() as { url: string; answer: Answer; checkedAt: string }
      if (snapshot.answer !== answer || snapshot.checkedAt !== checkedAt) throw new Error('Snapshot is stale')
      const title = `${snapshot.answer.toUpperCase()} — Can I Work Now?`
      if ((coarsePointer || compact) && navigator.share) {
        try {
          await navigator.share({ title, text: 'Status snapshot from Can I Work Now?', url: snapshot.url })
          setShareState('idle')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setShareState('idle')
            return
          }
        }
      }
      await navigator.clipboard.writeText(snapshot.url)
      setShareState('copied')
      window.setTimeout(() => setShareState('idle'), 2400)
    } catch {
      setShareState('error')
      window.setTimeout(() => setShareState('idle'), 3200)
    }
  }

  return (
    <main className={`instrument instrument--${answer}`} onPointerMove={handlePointerMove}>
      <div className="shader" aria-hidden="true">
        <GrainGradient
          width="100%"
          height="100%"
          colors={shader.colors}
          colorBack={shader.back}
          softness={answer === 'no' ? 0.38 : 0.62}
          intensity={answer === 'no' ? 0.68 : 0.48}
          noise={dark ? 0.22 : 0.16}
          shape={answer === 'no' ? 'truchet' : 'corners'}
          speed={reducedMotion ? 0 : answer === 'no' ? 0.22 : 0.42}
          scale={answer === 'no' ? 1.62 : 0.9}
          rotation={answer === 'no' ? 13 : -8}
          offsetX={shaderOffset.x}
          offsetY={shaderOffset.y}
          minPixelRatio={1}
          maxPixelCount={coarsePointer ? 620_000 : 1_250_000}
        />
      </div>
      <div className="veil" aria-hidden="true" />

      <header className="masthead">
        <span className="wordmark">CAN I WORK NOW</span>
      </header>

      <button
        type="button"
        className="share-status"
        aria-label="Share current status snapshot"
        disabled={!liveResolved || !checkedAt || shareState === 'sharing'}
        onClick={() => { void handleShare() }}
      >
        <svg className="share-status__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M5 11 11 5M6.5 5H11v4.5" />
        </svg>
        <span className="share-status__label">
          {shareState === 'sharing' ? 'SHARING' : shareState === 'copied' ? 'COPIED' : shareState === 'error' ? 'ERROR' : 'SHARE'}
        </span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {shareState === 'copied' ? 'Snapshot link copied' : shareState === 'error' ? 'Could not create snapshot' : ''}
      </span>

      <section className="answer" aria-live="polite" aria-atomic="true">
        <h1 className="answer__word">{answerWord}</h1>
        <p className="sr-only">
          {answer === 'yes'
            ? 'Yes. All monitored systems are operational.'
            : answer === 'no'
              ? `No. ${issues.map((issue) => issue.name).join(', ')} ${issues.length === 1 ? 'has' : 'have'} a current issue.`
              : 'Checking the live status of monitored systems.'}
        </p>
      </section>

      <footer className="utility">
        <Systems services={services} />
      </footer>

      {answer === 'no' && (
        <aside
          className="issue-panel"
          data-open={panelOpen}
          data-scrollable={panelScrollable}
          aria-label="Current service issues"
        >
          <button
            type="button"
            className="issue-panel__heading"
            aria-expanded={panelOpen}
            aria-controls="issue-list"
            onClick={handlePanelToggle}
          >
            <span>{issueSummary}</span>
            <span className="issue-panel__chevron" aria-hidden="true" />
          </button>
          <div
            className="issue-panel__body"
            onTransitionEnd={(event) => {
              if (event.propertyName === 'grid-template-rows' && panelOpen) setPanelScrollable(true)
            }}
          >
            <div className="issue-list" id="issue-list" inert={!panelOpen}>
              {issues.map((issue, index) => (
                <article className="issue" key={issue.id}>
                  <div className="issue__index">{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <h2>{issue.name}</h2>
                    <p>{issue.detail}</p>
                    <div className="issue__sources">
                      {issue.links.map((link) => (
                        <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>
                          {link.label}<span aria-hidden="true">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      )}
    </main>
  )
}

export default App
