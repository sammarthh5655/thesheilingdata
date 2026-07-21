import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The backend selector (src/backend/index.js) uses top-level await.
    target: 'es2022',
  },
  server: {
    port: 8791,
    strictPort: true,
  },
})
