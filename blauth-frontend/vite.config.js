import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isHtmlRequest = (req) => req.headers.accept?.includes('text/html');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/identity': 'http://localhost:3001',
      '/asset': 'http://localhost:3001',
      '/role': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
      '/verify': {
        target: 'http://localhost:3001',
        bypass: (req) => (isHtmlRequest(req) ? '/index.html' : undefined),
      },
      '/developer': {
        target: 'http://localhost:3001',
        bypass: (req) => (isHtmlRequest(req) ? '/index.html' : undefined),
      },
      '/audit': {
        target: 'http://localhost:3001',
        bypass: (req) => (isHtmlRequest(req) ? '/index.html' : undefined),
      },
    },
  },
})


