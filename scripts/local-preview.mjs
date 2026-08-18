import http from 'node:http'
import { createServer as createViteServer } from 'vite'

const port = Number(process.env.CANIWORKNOW_LOCAL_PORT || 4174)
process.env.PUBLIC_ORIGIN ||= `http://127.0.0.1:${port}`
process.env.SNAPSHOT_SECRET ||= 'local-preview-only-secret-that-is-not-used-in-production'

const vite = await createViteServer({
  root: process.cwd(),
  appType: 'spa',
  server: { middlewareMode: true },
})

const statusHandler = (await vite.ssrLoadModule('/api/status.ts')).default
const shareHandler = (await vite.ssrLoadModule('/api/share.ts')).default
const snapshotHandler = (await vite.ssrLoadModule('/api/snapshot.ts')).default
const ogHandler = (await vite.ssrLoadModule('/api/og-v2.ts')).default

function query(searchParams) {
  const result = {}
  for (const [key, value] of searchParams) {
    const current = result[key]
    if (current === undefined) result[key] = value
    else result[key] = Array.isArray(current) ? [...current, value] : [current, value]
  }
  return result
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  try {
    if (url.pathname === '/api/status') {
      await statusHandler({ method: request.method, query: query(url.searchParams), headers: request.headers }, response)
      return
    }
    if (url.pathname === '/api/share') {
      await shareHandler({ method: request.method, headers: request.headers }, response)
      return
    }
    if (url.pathname.startsWith('/s/v2/')) {
      await snapshotHandler({ method: request.method, query: { token: decodeURIComponent(url.pathname.slice('/s/v2/'.length)) } }, response)
      return
    }
    if (url.pathname === '/api/og-v2') {
      await ogHandler({ method: request.method, query: query(url.searchParams) }, response)
      return
    }
    vite.middlewares(request, response)
  } catch (error) {
    vite.ssrFixStacktrace(error)
    console.error(error)
    if (!response.headersSent) response.statusCode = 500
    response.end('Local preview error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`caniworknow local preview listening on ${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await vite.close()
    server.close(() => process.exit(0))
  })
}
