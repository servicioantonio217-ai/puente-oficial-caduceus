import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0', // Expose on all interfaces for QR sideloading
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
  },
})
