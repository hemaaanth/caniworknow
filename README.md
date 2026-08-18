# caniworknow.com

A deliberately minimal live status instrument for answering one question: **can I work now?**

Production: https://caniworknow.com

## Signals

The answer covers GitHub, Cloudflare, Claude, and Codex. Each service combines:

- Relevant components from the provider's official status API
- StatusGator's independent/community signal
- A direct reachability probe

A reported official degradation or a corroborating community outage produces **NO**. Missing data never produces a false **YES**: when official data is unavailable, two independent healthy fallback signals are required. Downdetector and Down for Everyone or Just Me are linked as additional human-verification sources; they are not scraped where automated access is blocked or restricted.

The `/api/status` Vercel function uses request timeouts and five-minute CDN caching (`s-maxage=300`, stale-while-revalidate). The client refreshes every five minutes and may use a cached result for up to 15 minutes if a refresh fails.

## Status snapshots

The homepage keeps a timeless social preview. On an intentional share, `/api/share` returns a self-contained signed, immutable snapshot URL containing the confirmed verdict, affected services, and check time. No database or Blob write is needed. `/s/v2/:token` renders snapshot-specific Open Graph/Twitter metadata and compares the captured verdict with the live API for human visitors. `/api/og-v2` generates a timestamped 1200×630 PNG that can be cached permanently because every snapshot URL is unique.

Set a stable `SNAPSHOT_SECRET` of at least 32 characters in every Vercel environment. Do not rotate it casually: existing snapshot URLs are authenticated with this value and would stop resolving after rotation. `PUBLIC_ORIGIN` is optional in production and useful for local URL generation. `STATUS_ORIGIN` is only needed when a public preview URL must fetch status through a different internal origin.

## Abuse prevention

- `/api/status` rejects cache-busting query parameters, serves a shared five-minute result from each CDN location, and serves stale data while one revalidation runs.
- Official JSON and community HTML reads have strict decompressed-size limits in addition to request timeouts.
- `/api/share` accepts small same-site or non-browser JSON `POST` requests only, validates the cached status shape, creates links only on an intentional share, and performs no storage write. The signed URL is deterministic for a given global check.
- New snapshot routes verify a bounded HMAC token before rendering; response headers disable framing, MIME sniffing, referrers, camera, microphone, and geolocation.

Per-IP limiting belongs at the edge, not in function memory. Vercel Hobby includes one WAF rate-limit rule per project, so use that rule for `Path starts with /api/`: a fixed 60-second window, 60 requests per IP, and a `429` response. This covers the status, share, and generated-image functions without counting static page assets.

Pro and Enterprise plans can replace that broad Hobby rule with granular limits:

- `POST /api/share`: 10 requests per minute per IP
- `GET /api/status`: 30 requests per minute per IP
- `GET /s/v2/*` and `GET /api/og-v2`: 120 requests per minute per IP

Do not challenge non-browser traffic on these routes: the Omarchy widget is an intentional `curl` client. See Vercel's [WAF rate-limiting limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting#limits).

## Interface

- Passive Paper Design Grain Gradient animation with restrained pointer influence
- System-aware light and dark appearances
- Dynamic `Y` / `N` favicon
- Minimal monitored-system icons with accessible status labels
- Anchored, collapsible live incident card on desktop and reachable incident sheet on touch devices
- No manual or query-string status simulation

## Omarchy plugin

Omarchy 4 users can add the live status directly to the shell bar:

```bash
omarchy plugin add https://github.com/hemaaanth/caniworknow-omarchy-plugin --enable
```

The bar uses monochrome Nerd Font thumbs for a confirmed **YES** or **NO**, and `?` while no global answer is available. The widget settings can switch to check/cross or Y/N icons. Click it for each service's state and the last check time. **Share latest** creates an immutable caniworknow.com snapshot permalink and copies it with `wl-copy`; right-clicking the bar icon does the same. Middle-click refreshes immediately.

The widget refreshes every five minutes by default and preserves its last known result if a later request fails. Change the interval in the Omarchy bar widget settings, or update/remove the plugin with `omarchy plugin update caniworknow.status` and `omarchy plugin remove caniworknow.status`.

Plugin source, screenshots, installation details, and marketplace releases live in the standalone [caniworknow-omarchy-plugin repository](https://github.com/hemaaanth/caniworknow-omarchy-plugin).

## Development

```bash
npm install
npm run dev
```

For an end-to-end local preview with the Vite UI and status/share/snapshot handlers on one origin:

```bash
npm run dev:full
```

The plain Vite server does not emulate Vercel functions. You can alternatively use Vercel's local runtime with values from `.env.example`:

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
