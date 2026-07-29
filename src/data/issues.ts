export type SourceLink = {
  label: string
  url: string
}

export type ServiceIssue = {
  id: 'claude' | 'github'
  service: string
  summary: string
  sources: SourceLink[]
}

export const mockIssues: ServiceIssue[] = [
  {
    id: 'claude',
    service: 'Claude',
    summary: 'Degraded API performance',
    sources: [
      { label: 'Anthropic status', url: 'https://status.anthropic.com/' },
      { label: 'Downdetector', url: 'https://downdetector.com/status/anthropic/' },
    ],
  },
  {
    id: 'github',
    service: 'GitHub Actions',
    summary: 'Workflow runs delayed',
    sources: [
      { label: 'GitHub status', url: 'https://www.githubstatus.com/' },
      { label: 'Downdetector', url: 'https://downdetector.com/status/github/' },
    ],
  },
]
