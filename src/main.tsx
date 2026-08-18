import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import type { StatusSnapshot } from './lib/snapshot-presentation'

const snapshot = (globalThis as typeof globalThis & {
  __CANIWORKNOW_SNAPSHOT__?: StatusSnapshot
}).__CANIWORKNOW_SNAPSHOT__

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App snapshot={snapshot} />
  </StrictMode>,
)
