import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/identity': 'http://localhost:3001',
      '/verify': 'http://localhost:3001',
      '/developer': 'http://localhost:3001',
      '/asset': 'http://localhost:3001',
      '/role': 'http://localhost:3001',
      '/audit': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
})

