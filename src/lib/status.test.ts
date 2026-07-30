import { describe, expect, it } from 'vitest'
import {
  aggregateAnswer,
  aggregateService,
  createFaviconSvg,
  displayAnswer,
  parseCommunityStatus,
  parseOfficialStatus,
  type NormalizedSource,
} from './status'

describe('parseOfficialStatus', () => {
  it('uses only mission-critical components for the requested service', () => {
    const result = parseOfficialStatus('codex', {
      components: [
        { name: 'Images', status: 'major_outage' },
        { name: 'Codex API', status: 'operational' },
        { name: 'Codex Web', status: 'degraded_performance' },
        { name: 'CLI', status: 'operational' },
      ],
      incidents: [{ name: 'Image generation unavailable', status: 'investigating', components: [] }],
    })

    expect(result.health).toBe('degraded')
    expect(result.detail).toBe('Codex Web is degraded')
  })
})

describe('parseCommunityStatus', () => {
  it('recognizes a clear crowd-reported outage', () => {
    expect(parseCommunityStatus('<h2>Yes, we are detecting problems with Claude right now.</h2>')).toEqual({
      health: 'outage',
      detail: 'Community reports indicate problems',
    })
  })

  it('recognizes a clear all-clear signal', () => {
    expect(parseCommunityStatus('<h2>No, we are not detecting any problems with GitHub right now.</h2>').health).toBe('operational')
  })

  it('recognizes StatusGator current-state headings before historical page content', () => {
    const html = '<h3>Claude is down</h3><p>A previous outage is now resolved. No current problems were reported yesterday.</p>'
    expect(parseCommunityStatus(html)).toEqual({
      health: 'outage',
      detail: 'Community reports indicate problems',
    })
  })
})

describe('aggregation', () => {
  const source = (kind: NormalizedSource['kind'], health: NormalizedSource['health']): NormalizedSource => ({
    id: `${kind}-${health}`,
    label: kind,
    kind,
    health,
    detail: '',
    url: 'https://example.com',
  })

  it('lets either an official outage or community outage make the answer no', () => {
    const claude = aggregateService('claude', [source('official', 'operational'), source('community', 'outage')])
    expect(claude.health).toBe('outage')
    expect(aggregateAnswer([claude])).toBe('no')
  })

  it('does not claim yes when official data is missing and only one fallback is healthy', () => {
    const github = aggregateService('github', [source('official', 'unknown'), source('community', 'operational')])
    expect(github.health).toBe('unknown')
    expect(aggregateAnswer([github])).toBe('unknown')
  })

  it('accepts two independent healthy fallbacks when the official source is unavailable', () => {
    const github = aggregateService('github', [
      source('official', 'unknown'),
      source('community', 'operational'),
      source('probe', 'operational'),
    ])
    expect(github.health).toBe('operational')
  })
})

describe('displayAnswer', () => {
  it('keeps the central answer empty until fresh status is available', () => {
    expect(displayAnswer('unknown')).toBe('')
    expect(displayAnswer('yes')).toBe('YES')
    expect(displayAnswer('no')).toBe('NO')
  })
})

describe('createFaviconSvg', () => {
  it('renders N for a no answer and Y for a yes answer', () => {
    expect(createFaviconSvg('no')).toContain('>N<')
    expect(createFaviconSvg('yes')).toContain('>Y<')
  })
})
