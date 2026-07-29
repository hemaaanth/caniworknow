# caniworknow.com — design mockup v1

A deliberately minimal status instrument for answering one question: **can I work now?**

This first pass is design-only. Service data is mocked while the visual system, responsive behavior, and incident interaction are refined.

## Prototype controls

- **Up / Y** — all four monitored systems operational
- **Down / N** — mock incidents for Claude and GitHub Actions
- In the down state, the issue card follows the pointer on desktop and becomes a reachable bottom sheet on touch devices.
- Light and dark appearances follow the operating system automatically.

## Local development

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
npm run preview
```

## Stack

- Vite
- React + TypeScript
- Paper Design `GrainGradient`
- Instrument Sans Variable

## Deployment

Production deploys automatically to Vercel from the private GitHub repository. The custom domain is:

- https://caniworknow.com

The Vite production output remains a static `dist/` directory. Live status/API integration intentionally comes after design approval.
