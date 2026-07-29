import {
  aggregateAnswer,
  aggregateService,
  parseCommunityStatus,
  parseOfficialStatus,
  type LiveStatusResponse,
  type NormalizedSource,
  type RawStatusPage,
  type ServiceId,
} from '../../src/lib/status.js'

export type SourceUrls = Record<ServiceId, readonly [official: string, community: string, probe: string]>
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export const DEFAULT_SOURCE_URLS: SourceUrls = {
  github: [
    'https://www.githubstatus.com/api/v2/components.json',
    'https://statusgator.com/services/github',
    'https://github.com/',
  ],
  cloudflare: [
    'https://www.cloudflarestatus.com/api/v2/components.json',
    'https://statusgator.com/services/cloudflare',
    'https://dash.cloudflare.com/',
  ],
  claude: [
    'https://status.claude.com/api/v2/components.json',
    'https://statusgator.com/services/claude',
    'https://claude.ai/',
  ],
  codex: [
    'https://status.openai.com/api/v2/components.json',
    'https://statusgator.com/services/openai',
    'https://chatgpt.com/',
  ],
}

const SERVICE_IDS = Object.keys(DEFAULT_SOURCE_URLS) as ServiceId[]
const REQUEST_TIMEOUT_MS = 4_500

function requestInit(accept: string): RequestInit {
  return {
    headers: {
      accept,
      'user-agent': 'caniworknow-status/1.0 (+https://caniworknow.com)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
}

async function officialSource(fetcher: Fetcher, service: ServiceId, url: string): Promise<NormalizedSource> {
  try {
    const response = await fetcher(url, requestInit('application/json'))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parseOfficialStatus(service, await response.json() as RawStatusPage)
    return { id: `${service}-official`, label: 'Official', kind: 'official', url, ...parsed }
  } catch {
    return {
      id: `${service}-official`,
      label: 'Official',
      kind: 'official',
      health: 'unknown',
      detail: 'Official status unavailable',
      url,
    }
  }
}

async function communitySource(fetcher: Fetcher, service: ServiceId, url: string): Promise<NormalizedSource> {
  try {
    const response = await fetcher(url, requestInit('text/html'))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const parsed = parseCommunityStatus(await response.text())
    return { id: `${service}-community`, label: 'StatusGator', kind: 'community', url, ...parsed }
  } catch {
    return {
      id: `${service}-community`,
      label: 'StatusGator',
      kind: 'community',
      health: 'unknown',
      detail: 'Community signal unavailable',
      url,
    }
  }
}

async function probeSource(fetcher: Fetcher, service: ServiceId, url: string): Promise<NormalizedSource> {
  try {
    const response = await fetcher(url, requestInit('text/html,application/xhtml+xml'))
    const health = response.status < 500 ? 'operational' : 'outage'
    await response.body?.cancel()
    return {
      id: `${service}-probe`,
      label: 'Reachability',
      kind: 'probe',
      health,
      detail: health === 'operational' ? 'Service is reachable' : `Probe returned HTTP ${response.status}`,
      url,
    }
  } catch {
    return {
      id: `${service}-probe`,
      label: 'Reachability',
      kind: 'probe',
      health: 'unknown',
      detail: 'Reachability probe unavailable',
      url,
    }
  }
}

export async function collectLiveStatus(
  fetcher: Fetcher = fetch,
  sourceUrls: SourceUrls = DEFAULT_SOURCE_URLS,
): Promise<LiveStatusResponse> {
  const services = await Promise.all(SERVICE_IDS.map(async (service) => {
    const [officialUrl, communityUrl, probeUrl] = sourceUrls[service]
    const sources = await Promise.all([
      officialSource(fetcher, service, officialUrl),
      communitySource(fetcher, service, communityUrl),
      probeSource(fetcher, service, probeUrl),
    ])
    return aggregateService(service, sources)
  }))

  return {
    answer: aggregateAnswer(services),
    checkedAt: new Date().toISOString(),
    services,
  }
}
