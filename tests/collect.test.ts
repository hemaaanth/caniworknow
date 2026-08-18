import { describe, expect, it, vi } from 'vitest'
import { collectLiveStatus } from '../server/collect'

const officialPayloads: Record<string, object> = {
  github: { components: [{ name: 'Actions', status: 'operational', showcase: true }] },
  cloudflare: { components: [{ name: 'API', status: 'operational' }] },
  claude: { components: [{ name: 'Claude Code', status: 'operational' }] },
  codex: { components: [{ name: 'Codex API', status: 'operational' }] },
}

describe('collectLiveStatus', () => {
  it('combines official, community, and probe data into a live yes answer', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input)
      const service = Object.keys(officialPayloads).find((id) => url.includes(`test/${id}/official`))
      if (service) return new Response(JSON.stringify(officialPayloads[service]), { status: 200 })
      if (url.includes('/community')) return new Response('No, we are not detecting any problems right now.', { status: 200 })
      return new Response('', { status: 204 })
    })

    const result = await collectLiveStatus(fetcher, {
      github: ['https://test/github/official', 'https://test/github/community', 'https://test/github/probe'],
      cloudflare: ['https://test/cloudflare/official', 'https://test/cloudflare/community', 'https://test/cloudflare/probe'],
      claude: ['https://test/claude/official', 'https://test/claude/community', 'https://test/claude/probe'],
      codex: ['https://test/codex/official', 'https://test/codex/community', 'https://test/codex/probe'],
    })

    expect(result.answer).toBe('yes')
    expect(result.services).toHaveLength(4)
    expect(fetcher).toHaveBeenCalledTimes(12)
  })

  it('returns unknown rather than inventing an answer when every source fails', async () => {
    const fetcher = vi.fn(async () => { throw new Error('network unavailable') })
    const result = await collectLiveStatus(fetcher)
    expect(result.answer).toBe('unknown')
    expect(result.services.every((service) => service.health === 'unknown')).toBe(true)
  })

  it('bounds upstream response bodies before parsing them', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/official')) return new Response('x'.repeat(512_001), { status: 200 })
      if (url.includes('/community')) return new Response('x'.repeat(1_000_001), { status: 200 })
      return new Response('', { status: 204 })
    })

    const result = await collectLiveStatus(fetcher, {
      github: ['https://test/github/official', 'https://test/github/community', 'https://test/github/probe'],
      cloudflare: ['https://test/cloudflare/official', 'https://test/cloudflare/community', 'https://test/cloudflare/probe'],
      claude: ['https://test/claude/official', 'https://test/claude/community', 'https://test/claude/probe'],
      codex: ['https://test/codex/official', 'https://test/codex/community', 'https://test/codex/probe'],
    })

    expect(result.answer).toBe('unknown')
    expect(result.services.every((service) => service.sources[0].health === 'unknown')).toBe(true)
    expect(result.services.every((service) => service.sources[1].health === 'unknown')).toBe(true)
  })
})
