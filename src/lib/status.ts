export type ServiceId = 'github' | 'cloudflare' | 'claude' | 'codex'
export type Health = 'operational' | 'degraded' | 'outage' | 'unknown'
export type Answer = 'yes' | 'no' | 'unknown'

export interface RawComponent {
  name: string
  status: string
  showcase?: boolean
}

export interface RawIncident {
  name: string
  status: string
  shortlink?: string
  components?: RawComponent[]
}

export interface RawStatusPage {
  components?: RawComponent[]
  incidents?: RawIncident[]
}

export interface NormalizedSource {
  id: string
  label: string
  kind: 'official' | 'community' | 'probe'
  health: Health
  detail: string
  url: string
}

export interface ServiceStatus {
  id: ServiceId
  name: string
  health: Health
  detail: string
  sources: NormalizedSource[]
  links: Array<{ label: string; url: string }>
}

export interface LiveStatusResponse {
  answer: Answer
  checkedAt: string
  services: ServiceStatus[]
}

const RELEVANT_COMPONENTS: Record<ServiceId, (component: RawComponent) => boolean> = {
  github: (component) => component.showcase === true && component.name !== 'Visit www.githubstatus.com for more information',
  cloudflare: (component) => [
    'Access',
    'API',
    'Authoritative DNS',
    'CDN/Cache',
    'CDN Cache Purge',
    'Dashboard',
    'Pages',
    'Recursive DNS',
    'Workers',
    'Workers AI',
    'Workers KV',
  ].includes(component.name),
  claude: (component) => ['claude.ai', 'Claude API (api.anthropic.com)', 'Claude Code'].includes(component.name),
  codex: (component) => /codex|^cli$|vs code extension/i.test(component.name),
}

function componentHealth(status: string): Health {
  if (status === 'operational') return 'operational'
  if (status === 'degraded_performance' || status === 'under_maintenance') return 'degraded'
  if (status === 'partial_outage' || status === 'major_outage') return 'outage'
  return 'unknown'
}

function humanizeComponent(component: RawComponent, health: Health): string {
  if (health === 'degraded') return `${component.name} is degraded`
  if (health === 'outage') return `${component.name} has an outage`
  return `${component.name} status is unknown`
}

export function parseOfficialStatus(service: ServiceId, page: RawStatusPage): Pick<NormalizedSource, 'health' | 'detail'> {
  const components = (page.components ?? []).filter(RELEVANT_COMPONENTS[service])
  const affected = components
    .map((component) => ({ component, health: componentHealth(component.status) }))
    .find(({ health }) => health !== 'operational')

  if (affected) {
    return {
      health: affected.health,
      detail: humanizeComponent(affected.component, affected.health),
    }
  }

  if (components.length === 0) {
    return { health: 'unknown', detail: 'Official component data unavailable' }
  }

  return { health: 'operational', detail: 'All relevant components operational' }
}

const SERVICE_META: Record<ServiceId, Pick<ServiceStatus, 'name' | 'links'>> = {
  github: {
    name: 'GitHub',
    links: [
      { label: 'Official status', url: 'https://www.githubstatus.com/' },
      { label: 'StatusGator', url: 'https://statusgator.com/services/github' },
      { label: 'Down for Everyone or Just Me', url: 'https://downforeveryoneorjustme.com/github.com' },
      { label: 'Downdetector', url: 'https://downdetector.com/status/github/' },
    ],
  },
  cloudflare: {
    name: 'Cloudflare',
    links: [
      { label: 'Official status', url: 'https://www.cloudflarestatus.com/' },
      { label: 'StatusGator', url: 'https://statusgator.com/services/cloudflare' },
      { label: 'Down for Everyone or Just Me', url: 'https://downforeveryoneorjustme.com/cloudflare.com' },
      { label: 'Downdetector', url: 'https://downdetector.com/status/cloudflare/' },
    ],
  },
  claude: {
    name: 'Claude',
    links: [
      { label: 'Official status', url: 'https://status.claude.com/' },
      { label: 'StatusGator', url: 'https://statusgator.com/services/claude' },
      { label: 'Down for Everyone or Just Me', url: 'https://downforeveryoneorjustme.com/anthropic' },
      { label: 'Downdetector', url: 'https://downdetector.com/status/claude-ai/' },
    ],
  },
  codex: {
    name: 'Codex',
    links: [
      { label: 'Official status', url: 'https://status.openai.com/' },
      { label: 'StatusGator', url: 'https://statusgator.com/services/openai' },
      { label: 'Down for Everyone or Just Me', url: 'https://downforeveryoneorjustme.com/chatgpt.com' },
      { label: 'Downdetector', url: 'https://downdetector.com/status/openai/' },
    ],
  },
}

export function parseCommunityStatus(html: string): Pick<NormalizedSource, 'health' | 'detail'> {
  const headings = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
  const currentHeading = headings.find((heading) => /\bis (?:up|down|degraded)|current problems|having (?:an outage|problems)/.test(heading))

  if (currentHeading && /\bis up\b|no current problems/.test(currentHeading)) {
    return { health: 'operational', detail: 'No elevated community reports' }
  }

  if (currentHeading && /\bis down\b|\bis degraded\b|having (?:an outage|problems)|current problems/.test(currentHeading)) {
    return { health: 'outage', detail: 'Community reports indicate problems' }
  }

  const normalized = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()

  if (/not detecting any problems|no current problems/.test(normalized)) {
    return { health: 'operational', detail: 'No elevated community reports' }
  }

  if (/detecting (?:possible )?problems|reports (?:show|indicate) problems/.test(normalized)) {
    return { health: 'outage', detail: 'Community reports indicate problems' }
  }

  return { health: 'unknown', detail: 'Community signal unavailable' }
}

export function aggregateService(id: ServiceId, sources: NormalizedSource[]): ServiceStatus {
  const negative = sources.find((source) => source.health === 'outage')
    ?? sources.find((source) => source.health === 'degraded')

  let health: Health
  let detail: string

  if (negative) {
    health = negative.health
    detail = negative.detail || `${negative.label} reports a problem`
  } else {
    const official = sources.find((source) => source.kind === 'official')
    const healthyFallbacks = sources.filter((source) => source.kind !== 'official' && source.health === 'operational')

    if (official?.health === 'operational' || healthyFallbacks.length >= 2) {
      health = 'operational'
      detail = 'No current problems detected'
    } else {
      health = 'unknown'
      detail = 'Not enough fresh data to answer'
    }
  }

  return { id, ...SERVICE_META[id], health, detail, sources }
}

export function aggregateAnswer(services: ServiceStatus[]): Answer {
  if (services.some((service) => service.health === 'outage' || service.health === 'degraded')) return 'no'
  if (services.length === 0 || services.some((service) => service.health === 'unknown')) return 'unknown'
  return 'yes'
}

export function displayAnswer(answer: Answer): string {
  return answer === 'yes' ? 'YES' : answer === 'no' ? 'NO' : ''
}

export function createFaviconSvg(answer: Answer): string {
  const letter = answer === 'yes' ? 'Y' : answer === 'no' ? 'N' : '?'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#10100f"/><text x="32" y="44" text-anchor="middle" font-family="Arial,sans-serif" font-size="40" font-weight="700" fill="#f4f1e8">${letter}</text></svg>`
}
