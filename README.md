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

## Status snapshots

The homepage keeps a timeless social preview. Its share action asks `/api/share` for a signed, immutable snapshot URL containing the confirmed verdict, affected services, and check time. `/s/:token` renders snapshot-specific Open Graph/Twitter metadata and compares the captured verdict with the live API for human visitors. `/api/og` generates a timestamped 1200×630 PNG that can be cached permanently because every snapshot URL is unique.

Set a stable `SNAPSHOT_SECRET` of at least 32 characters in every Vercel environment. Do not rotate it casually: existing snapshot URLs are authenticated with this value and would stop resolving after rotation. `PUBLIC_ORIGIN` is optional in production and useful for local URL generation.

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

The plain Vite server does not emulate Vercel functions. Use Vercel's local runtime with values from `.env.example` when testing `/api/status`, `/api/share`, and `/s/:token` end-to-end:

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

Production deploys automatically from the public GitHub repository to Vercel.
