/// <reference types="node" />

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootFile = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const html = readFileSync(rootFile('index.html'), 'utf8')

function metaContent(key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta\\s+(?:property|name)="${escaped}"\\s+content="([^"]+)"\\s*/?>`))
  return match?.[1]
}

describe('social sharing metadata', () => {
  it('ships complete Open Graph metadata in the static HTML', () => {
    expect(metaContent('og:type')).toBe('website')
    expect(metaContent('og:url')).toBe('https://caniworknow.com/')
    expect(metaContent('og:site_name')).toBe('Can I Work Now?')
    expect(metaContent('og:title')).toBe('Can I Work Now?')
    expect(metaContent('og:description')).toBe('One answer for the tools your work depends on.')
    expect(metaContent('og:image')).toBe('https://caniworknow.com/og-v1.png')
    expect(metaContent('og:image:secure_url')).toBe('https://caniworknow.com/og-v1.png')
    expect(metaContent('og:image:type')).toBe('image/png')
    expect(metaContent('og:image:width')).toBe('1200')
    expect(metaContent('og:image:height')).toBe('630')
    expect(metaContent('og:image:alt')).toContain('Can I Work Now?')
    expect(html).toContain('<link rel="canonical" href="https://caniworknow.com/" />')
  })

  it('ships a complete large-image Twitter card fallback', () => {
    expect(metaContent('twitter:card')).toBe('summary_large_image')
    expect(metaContent('twitter:title')).toBe('Can I Work Now?')
    expect(metaContent('twitter:description')).toBe('One answer for the tools your work depends on.')
    expect(metaContent('twitter:image')).toBe('https://caniworknow.com/og-v1.png')
    expect(metaContent('twitter:image:alt')).toContain('Can I Work Now?')
  })

  it('uses a valid, non-empty 1200x630 PNG share image', () => {
    const imagePath = rootFile('public/og-v1.png')
    const png = readFileSync(imagePath)

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(statSync(imagePath).size).toBeGreaterThan(50_000)
  })
})

describe('service brand assets', () => {
  it.each(['github', 'cloudflare', 'claude', 'openai'])('ships a canonical %s SVG', (brand) => {
    const svg = readFileSync(rootFile(`public/brands/${brand}.svg`), 'utf8')
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
  })
})
