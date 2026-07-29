import { useEffect, useMemo, useRef, useState } from 'react'
import { GrainGradient } from '@paper-design/shaders-react'
import {
  createFaviconSvg,
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
}

const CACHE_KEY = 'caniworknow:live-status'
const CACHE_MAX_AGE_MS = 15 * 60 * 1000

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
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus((current) => current ?? readCachedStatus())
      }
    }

    void refresh()
    const interval = window.setInterval(refresh, 60_000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])

  return status
}

function ServiceIcon({ id }: { id: ServiceId }) {
  if (id === 'github') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="6" r="2.2" />
        <circle cx="17" cy="6" r="2.2" />
        <circle cx="12" cy="18" r="2.2" />
        <path d="M7 8.2v2.2c0 2 1.6 3.6 3.6 3.6H12m5-5.8v2.2c0 2-1.6 3.6-3.6 3.6H12v1.8" />
      </svg>
    )
  }

  if (id === 'cloudflare') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 17.5h12.8a3.2 3.2 0 0 0 .2-6.4 6.6 6.6 0 0 0-12.7 1.7 2.4 2.4 0 0 0-.3 4.7Z" />
      </svg>
    )
  }

  if (id === 'claude') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8v18.4M2.8 12h18.4M5.5 5.5l13 13M18.5 5.5l-13 13M8.6 3.5l6.8 17M20.5 8.6l-17 6.8" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6Z" />
      <path d="m9 9 3-1.7L15 9v3.5l-3 1.8-3-1.8V9Zm3 5.3v3.4" />
    </svg>
  )
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
  const status = useLiveStatus()
  const answer: Answer = status?.answer ?? 'unknown'
  const services = status?.services ?? FALLBACK_SERVICES
  const issues = services.filter((service) => service.health === 'outage' || service.health === 'degraded')
  const [shaderOffset, setShaderOffset] = useState({ x: 0, y: 0 })
  const { dark, reducedMotion, coarsePointer } = useMediaState()
  const panelRef = useRef<HTMLElement>(null)
  const targetRef = useRef({ x: window.innerWidth * 0.64, y: window.innerHeight * 0.52 })
  const currentRef = useRef({ ...targetRef.current })
  const panelHoverRef = useRef(false)
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
    if (answer !== 'no' || coarsePointer) return

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
  }, [answer, coarsePointer, reducedMotion])

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!coarsePointer && answer === 'no' && !panelHoverRef.current) {
      const panelWidth = panelRef.current?.offsetWidth ?? 350
      const panelHeight = panelRef.current?.offsetHeight ?? 280
      const gap = 26
      targetRef.current = {
        x: Math.max(18, Math.min(event.clientX + gap, window.innerWidth - panelWidth - 18)),
        y: Math.max(18, Math.min(event.clientY + gap, window.innerHeight - panelHeight - 18)),
      }
    }

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

  const answerWord = answer === 'yes' ? 'YES' : answer === 'no' ? 'NO' : '—'

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
          ref={panelRef}
          aria-label="Current service issues"
          onPointerEnter={() => { panelHoverRef.current = true }}
          onPointerLeave={() => { panelHoverRef.current = false }}
        >
          <div className="issue-panel__heading">
            <span>Current signal</span>
            <span>{String(issues.length).padStart(2, '0')}</span>
          </div>
          <div className="issue-list">
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
        </aside>
      )}
    </main>
  )
}

export default App
