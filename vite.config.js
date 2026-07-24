import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// ---------------------------------------------------------------------------
// Runs the Vercel serverless functions in api/ during `vite dev`, so the AI
// assistant works on localhost without needing `vercel dev` (which requires a
// Vercel login + linked project). In production Vercel serves api/ itself and
// this plugin is not used.
// ---------------------------------------------------------------------------
function devApiPlugin() {
  return {
    name: 'tsd-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (!path.startsWith('/api/')) return next()

        const name = path.slice('/api/'.length).replace(/\/+$/, '')
        if (!/^[a-z0-9-]+$/i.test(name)) return next()

        // Collect and parse the JSON body the way Vercel does.
        let body = {}
        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const raw = Buffer.concat(chunks).toString('utf8')
          if (raw) {
            try {
              body = JSON.parse(raw)
            } catch {
              body = {}
            }
          }
        }
        req.body = body

        // Minimal shims for the Vercel res.status().json() helpers.
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
          return res
        }

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[dev-api] /api/${name} failed: ${err?.message || err}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Local API error — check the dev server terminal.' }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load .env with an empty prefix so non-VITE_ vars (the Gemini keys) reach
  // process.env for the api/ functions. These stay server-side: Vite only
  // exposes VITE_-prefixed vars to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    plugins: [react(), devApiPlugin()],
    build: {
      // The backend selector (src/backend/index.js) uses top-level await.
      target: 'es2022',
    },
    server: {
      port: 8791,
      strictPort: true,
    },
  }
})
