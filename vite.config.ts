import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICE_WORKER = 'sw.js';

/**
 * Writes the list of files the service worker saves for offline use, and a version
 * derived from their content so every build replaces the previous cache.
 */
function serviceWorkerPrecache(): Plugin {
  return {
    name: 'infotransport-service-worker-precache',
    apply: 'build',
    // After Vite emitted index.html.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const worker = bundle[SERVICE_WORKER];
      if (worker?.type !== 'chunk') return this.error(`${SERVICE_WORKER} absent du build.`);
      const hash = createHash('sha256');
      const files: string[] = [];
      for (const [name, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        // The e-ink view keeps its own CSS out of the offline interface.
        if (name === SERVICE_WORKER || name.startsWith('.vite/') || name.endsWith('.map')) continue;
        if (item.type === 'chunk' && item.name === 'minimal') continue;
        if (item.type === 'asset' && item.names.some((n) => n.startsWith('minimal'))) continue;
        files.push(`/${name}`);
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      if (!files.includes('/index.html')) this.error('index.html absent du build.');
      const publicDir = resolve('public');
      for (const name of readdirSync(publicDir).sort()) {
        files.push(`/${name}`);
        hash.update(name).update(readFileSync(resolve(publicDir, name)));
      }
      const version = hash.digest('hex').slice(0, 16);
      const replace = (code: string, token: string, value: string) => {
        const pattern = new RegExp(`(["'\`])${token}\\1`);
        if (!pattern.test(code)) this.error(`Marqueur ${token} absent de ${SERVICE_WORKER}.`);
        return code.replace(pattern, () => JSON.stringify(value));
      };
      worker.code = replace(
        replace(worker.code, '__INFOTRANSPORT_PRECACHE__', JSON.stringify(files)),
        '__INFOTRANSPORT_VERSION__',
        version,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPrecache()],
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
      input: {
        app: resolve('index.html'),
        minimal: resolve('src/client/minimal.css'),
        sw: resolve('src/client/sw.ts'),
      },
      output: {
        // The service worker URL must stay stable across builds.
        entryFileNames: (chunk) =>
          chunk.name === 'sw' ? SERVICE_WORKER : 'assets/[name]-[hash].js',
      },
    },
  },
});
