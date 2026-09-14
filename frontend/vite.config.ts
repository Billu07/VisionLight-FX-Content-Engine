import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: an app deploy doesn't invalidate React / Supabase in
        // visitors' caches. Everything else is split per route (React.lazy in App.tsx).
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (!path.includes('/node_modules/')) return undefined
          if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(path)) return 'vendor-react'
          if (path.includes('/node_modules/@supabase/')) return 'vendor-supabase'
          return undefined
        },
      },
    },
  },
})
