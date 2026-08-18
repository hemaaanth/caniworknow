import type { Answer, LiveStatusResponse, ServiceId } from './status.js'

export const SERVICE_NAMES: Record<ServiceId, string> = {
  github: 'GitHub',
  cloudflare: 'Cloudflare',
  claude: 'Claude',
  codex: 'Codex',
}

export const SERVICE_IDS = Object.keys(SERVICE_NAMES) as ServiceId[]

export interface StatusSnapshot {
  v: 1
  answer: Answer
  checkedAt: string
  capturedAt: string
  affected: ServiceId[]
}

export function formatSnapshotChecked(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `Checked ${value('month')} ${value('day')}, ${value('year')} · ${value('hour')}:${value('minute')} UTC`
}

export function snapshotIssueLabel(snapshot: StatusSnapshot): string {
  const names = snapshot.affected.map((id) => SERVICE_NAMES[id])
  if (snapshot.answer === 'yes') return 'All monitored systems were operational'
  if (snapshot.answer === 'unknown') return 'Status could not be confirmed'
  if (names.length === 0) return 'A monitored system had a current issue'
  if (names.length === 1) return `${names[0]} had a current issue`
  if (names.length === 2) return `${names[0]} and ${names[1]} had current issues`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} had current issues`
}

export function snapshotAnswerWord(answer: Answer): string {
  return answer === 'yes' ? 'YES' : answer === 'no' ? 'NO' : 'DUNNO'
}

export function snapshotMatchesLive(snapshot: StatusSnapshot, current: LiveStatusResponse): boolean {
  const currentAffected = current.services
    .filter((service) => service.health === 'outage' || service.health === 'degraded')
    .map((service) => service.id)
  return current.answer === snapshot.answer && currentAffected.join(',') === snapshot.affected.join(',')
}
