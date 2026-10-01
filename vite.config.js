/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_API_TARGET = 'https://staging-fintrack.vercel.app'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // /api/* runs as Vercel functions, which `vite dev` cannot serve, so forward it to a deployed backend.
  // Set API_PROXY_TARGET in .env.local to point at a different deployment.
  const apiTarget = env.API_PROXY_TARGET || DEFAULT_API_TARGET

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: proxy => {
            // The refresh cookie is marked Secure; drop that flag so browsers keep it on http://localhost.
            proxy.on('proxyRes', proxyRes => {
              const cookies = proxyRes.headers['set-cookie']
              if (cookies) proxyRes.headers['set-cookie'] = cookies.map(cookie => cookie.replace(/;\s*Secure/gi, ''))
            })
          },
        },
      },
    },
    // `vite preview` would otherwise reuse server.proxy; keep preview (and the Playwright suite) off the real backend.
    preview: { proxy: {} },
  }
})
