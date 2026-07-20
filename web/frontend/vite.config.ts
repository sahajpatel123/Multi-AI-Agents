import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Forward /api/* to the FastAPI backend on port 8000 so the SPA can
    // call /api/health, /api/auth/*, /api/personas etc. without CORS
    // preflights during local dev. Production builds deploy to Vercel,
    // which has its own rewrite rule for /api/* — the dev proxy here
    // exists only so `npm run dev` works without manual CORS or env
    // juggling. The target defaults to localhost:8000 but can be
    // overridden with VITE_API_URL for split environments.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
})
