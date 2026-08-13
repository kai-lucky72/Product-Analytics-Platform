import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-server reverse proxy to the backend services. The online preview
// environment exposes a single port, so all /api and /auth traffic is routed
// here to the individual microservices (see the frontend-reverse-proxy rule).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.monkeycode-ai.live'],
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
      },
      '/i/': {
        target: 'http://127.0.0.1:4002',
        changeOrigin: true,
      },
      '/api/v1/dashboards': {
        target: 'http://127.0.0.1:4006',
        changeOrigin: true,
      },
      '/api/v1/rules': {
        target: 'http://127.0.0.1:4005',
        changeOrigin: true,
      },
      '/api/v1': {
        target: 'http://127.0.0.1:4004',
        changeOrigin: true,
      },
    },
  },
});
