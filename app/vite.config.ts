import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Fix even-toolkit internal relative imports in vitest
      'even-toolkit/dist/glasses/types': path.resolve(__dirname, './node_modules/even-toolkit/dist/glasses/types.js'),
    },
    dedupe: ['react', 'react-dom', 'react-router', '@evenrealities/even_hub_sdk'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
