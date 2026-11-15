import express from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { MinimalBlock } from '../components/Block.js';
import { minimalDebugMarkup } from '../shared/minimal-debug.js';
import { layout, minimalGridSize, shownInMinimal } from '../shared/model.js';
import { Service } from './service.js';
import { Store } from './storage.js';
import { createMcpRouter } from './mcp.js';
import { createMetrics } from './metrics.js';
const app = express();
app.disable('x-powered-by');
const service = new Service(
  new Store(resolve(process.env.DATA_DIR || 'data')),
  process.env.PRIM_API_KEY || '',
);
await service.init();
const metrics = createMetrics(() => service.budget.counts());
app.use(metrics.middleware);
app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api') || req.path === '/minimal')
    res.setHeader('Cache-Control', 'no-store');
  // Keep a LAN page on another origin from issuing administrative writes.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      res.status(403).json({ error: 'Origine de la requête refusée.' });
      return;
    }
  }
  next();
});
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/metrics', metrics.handler);
app.use('/mcp', createMcpRouter(service));
app.get('/api/dashboard', (_req, res) => res.json(service.dashboard()));
app.get('/api/config', (_req, res) => res.json(service.config));
app.put('/api/config', async (req, res) => {
  console.log('Mise à jour de la configuration');
  const config = await service.save(req.body);
  res.json(config);
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
app.get('/api/discover', async (req, res) => {
  const ref = z
    .string()
    .regex(/^(STIF:Stop(?:Area:SP|Point:Q):\d+:|DEMO:[\w-]+)$/)
    .parse(req.query.ref);
  res.json(await service.discovery(ref));
});
const production = process.env.NODE_ENV === 'production';
app.get('/minimal', async (_req, res) => {
  const dashboard = service.dashboard();
  const { columns, rows } = dashboard.config.screen;
  const minimum = minimalGridSize(dashboard.config);
  const { cells } = layout(dashboard.config.blocks, columns);
  const blocks = dashboard.blocks
    .filter((view) => shownInMinimal(view.block))
    .map((view) => {
      const cell = cells.find((c) => c.id === view.block.id)!;
      return `<div class="minimal-cell" style="top:${(cell.row * 100) / rows}%;left:${(cell.col * 100) / columns}%;width:${(cell.span * 100) / columns}%;height:${100 / rows}%">${renderToStaticMarkup(createElement(MinimalBlock, { view, now: dashboard.now }))}</div>`;
    })
    .join('');
  let cssHref = '/src/client/minimal.css';
  if (production) {
    const manifest = JSON.parse(
      await readFile(resolve('dist/client/.vite/manifest.json'), 'utf8'),
    ) as Record<string, { file: string }>;
    const entry = manifest['src/client/minimal.css'];
    if (!entry) throw new Error('CSS épuré absent du build.');
    cssHref = '/' + entry.file;
  } else cssHref = '/minimal.css';
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
  app.get(['/', '/admin'], (_req, res) =>
    res.redirect(
      `http://${(_req.headers.host || 'localhost:3000').split(':')[0]}:5173${_req.path}`,
    ),
  );
}
app.use(
  (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(
      `[ERREUR] ${req.method} ${req.url} — ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · ') });
      return;
    }
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'La requête a échoué.' });
  },
);
const server = app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
  console.log(
    `InfoTransport : http://localhost:${process.env.PORT || 3000} · mode ${service.mode}`,
  );
  service.start();
});
server.on('error', (error) => {
  console.error(`Démarrage impossible : ${error.message}`);
  process.exit(1);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    service.stop();
    server.close(() => process.exit(0));
  });
