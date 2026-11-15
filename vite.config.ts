import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/minimal': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
      '/mcp': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist/client',
    manifest: true,
    rollupOptions: {
      input: { app: resolve('index.html'), minimal: resolve('src/client/minimal.css') },
    },
  },
});
