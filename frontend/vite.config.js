import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // P34: --host so phones on the same Wi-Fi can open the dev server.
    host: true,
    proxy: {
      // /api covers all backend calls incl. /api/auth/* and the SSE stream.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // P34: SSE must not be buffered by the dev proxy.
        // (http-proxy option; prevents response buffering of event-streams.)
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        }
      }
    }
  }
});
