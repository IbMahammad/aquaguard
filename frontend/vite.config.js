import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly rather than silently hopping ports - during a live demo you
    // want the URL you rehearsed with.
    strictPort: true,
    open: false,
  },
})
