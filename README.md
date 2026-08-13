# caniworknow.com

A deliberately minimal live status instrument for answering one question: **can I work now?**

Production: https://caniworknow.com

## Signals

The answer covers GitHub, Cloudflare, Claude, and Codex. Each service combines:

- Relevant components from the provider's official status API
- StatusGator's independent/community signal
- A direct reachability probe

A reported official degradation or a corroborating community outage produces **NO**. Missing data never produces a false **YES**: when official data is unavailable, two independent healthy fallback signals are required. Downdetector and Down for Everyone or Just Me are linked as additional human-verification sources; they are not scraped where automated access is blocked or restricted.

The `/api/status` Vercel function uses request timeouts and CDN caching (`s-maxage=60`, stale-while-revalidate). The client refreshes every minute and may use a cached result for up to 15 minutes if a refresh fails.

## Interface

- Passive Paper Design Grain Gradient animation with restrained pointer influence
- System-aware light and dark appearances
- Dynamic `Y` / `N` favicon
- Minimal monitored-system icons with accessible status labels
- Anchored, collapsible live incident card on desktop and reachable incident sheet on touch devices
- No manual or query-string status simulation

## Development

```bash
npm install
npm run dev
```

The plain Vite server does not emulate Vercel functions. Use Vercel's local runtime when testing `/api/status` end-to-end:

```bash
vercel dev
```

Quality checks:

```bash
npm test
npm run lint
npm run build
```

## Stack

- Vite
- React + TypeScript
- Vercel Functions
- Paper Design `GrainGradient`
- Instrument Sans Variable
- Vitest

Production deploys automatically from the private GitHub repository to Vercel.
