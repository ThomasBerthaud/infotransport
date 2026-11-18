import express from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { MinimalBlock } from '../components/Block.js';
import { minimalDebugMarkup } from '../shared/minimal-debug.js';
import { layout, minimalGridSize, shownInMinimal } from '../shared/model.js';
import type { Service } from './service.js';
import { createMcpRouter } from './mcp.js';
import { createMetrics } from './metrics.js';
import { toHttpError } from './errors.js';
import { log } from './log.js';

export type AppOptions = {
  /** Serve the Vite build from dist/client instead of redirecting to the dev server. */
  production: boolean;
};

const quiet = new Set(['/health', '/metrics']);

/**
 * Rejects requests a browser sends on behalf of another site. Non-browser clients
 * (curl, MCP clients, the target screen's navigation) send neither header and pass.
 */
const sameOriginOnly: express.RequestHandler = (req, res, next) => {
  const site = req.get('sec-fetch-site');
  const origin = req.get('origin');
  let crossOrigin = !!site && site !== 'same-origin' && site !== 'none';
  if (origin && !crossOrigin) {
    try {
      crossOrigin = new URL(origin).host !== req.get('host');
    } catch {
      crossOrigin = true;
    }
  }
  if (crossOrigin) {
    res.status(403).json({ error: 'Origine de la requête refusée.' });
    return;
  }
  next();
};

export function createApp(service: Service, { production }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  const metrics = createMetrics(() => service.budget.counts());
  app.use(metrics.middleware);
  app.use(express.json({ limit: '128kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api') || req.path === '/minimal')
      res.setHeader('Cache-Control', 'no-store');
    if (!quiet.has(req.path)) log.debug(`${req.method} ${req.url}`);
    // Keep a LAN page on another origin from issuing administrative writes.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return sameOriginOnly(req, res, next);
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/metrics', metrics.handler);
  app.use('/mcp', createMcpRouter(service));
  app.get('/api/dashboard', (_req, res) => res.json(service.dashboard()));
  app.get('/api/config', (_req, res) => res.json(service.config));
  app.put('/api/config', async (req, res) => {
    res.json(await service.save(req.body));
  });
  app.get('/api/status', (_req, res) => res.json(service.diagnostics()));
  app.get('/api/stops', async (req, res) => {
    const q = z.string().trim().min(2).max(100).parse(req.query.q);
    res.json(await service.search(q));
  });
  app.get('/api/lines', (req, res) => {
    const ref = z.string().max(150).parse(req.query.ref);
    res.json(service.catalog.lines(ref));
  });
  // A GET, but it can spend PRIM quota: another site must not be able to trigger it.
  app.get('/api/discover', sameOriginOnly, async (req, res) => {
    const ref = z
      .string()
      .regex(/^(STIF:Stop(?:Area:SP|Point:Q):\d+:|DEMO:[\w-]+)$/)
      .parse(req.query.ref);
    res.json(await service.discovery(ref));
  });
  let minimalCss: Promise<string> | undefined;
  const minimalCssHref = () =>
    (minimalCss ??= production
      ? readFile(resolve('dist/client/.vite/manifest.json'), 'utf8').then((text) => {
          const entry = (JSON.parse(text) as Record<string, { file: string }>)[
            'src/client/minimal.css'
          ];
          if (!entry) throw new Error('CSS épuré absent du build.');
          return '/' + entry.file;
        })
      : Promise.resolve('/minimal.css')).catch((error: unknown) => {
      minimalCss = undefined;
      throw error;
    });
  app.get('/minimal', async (_req, res) => {
    const dashboard = service.dashboard();
    const { columns, rows } = dashboard.config.screen;
    const minimum = minimalGridSize(dashboard.config);
    const cells = new Map(layout(dashboard.config.blocks, columns).cells.map((c) => [c.id, c]));
    const blocks = dashboard.blocks
      .filter((view) => shownInMinimal(view.block))
      .flatMap((view) => {
        const cell = cells.get(view.block.id);
        if (!cell) return [];
        return `<div class="minimal-cell" style="top:${(cell.row * 100) / rows}%;left:${(cell.col * 100) / columns}%;width:${(cell.span * 100) / columns}%;height:${100 / rows}%">${renderToStaticMarkup(createElement(MinimalBlock, { view, now: dashboard.now }))}</div>`;
      })
      .join('');
    const cssHref = await minimalCssHref();
    res
      .type('html')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${dashboard.refreshSeconds}"><title>Départs</title><link rel="stylesheet" href="${cssHref}"></head><body class="minimal-page"><div class="minimal-grid" style="min-width:${minimum.width}px;min-height:${minimum.height}px">${blocks}</div>${minimalDebugMarkup(dashboard.config.screen.debugDimensions)}</body></html>`,
      );
  });
  if (production) {
    app.use(express.static(resolve('dist/client'), { index: false, maxAge: 0 }));
    app.get(['/', '/admin'], (_req, res) => res.sendFile(resolve('dist/client/index.html')));
  } else {
    app.get('/minimal.css', (_req, res) => res.sendFile(resolve('src/client/minimal.css')));
    app.get(['/', '/admin'], (req, res) =>
      res.redirect(
        `http://${(req.headers.host || 'localhost:3000').split(':')[0]}:5173${req.path}`,
      ),
    );
  }
  app.use(
    (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const { status, message } = toHttpError(error);
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      if (status === 500) log.error(`${req.method} ${req.url} — HTTP ${status} — ${detail}`);
      else log.warn(`${req.method} ${req.url} — HTTP ${status} — ${message}`);
      res.status(status).json({ error: message });
    },
  );
  return app;
}
